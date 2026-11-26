package com.zagor.ekstre;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.DatabaseUtils;
import android.database.sqlite.SQLiteDatabase;
import android.os.Build;
import android.util.Log;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Iterator;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class ReminderScheduler extends BroadcastReceiver {
 static final Object LOCK=new Object();
 static final String OPEN_ACTION="com.zagor.ekstre.OPEN_REMINDERS";
 private static final String ALARM_ACTION="com.zagor.ekstre.REMINDER_ALARM";
 private static final String CHANNEL="wallet_reminders";
 private static final int NOTIFICATION=351;
 private static final int MAX_DOCUMENT=32_000_000;
 private static final LocalTime MORNING=LocalTime.of(9,0);
 private static final Pattern ID=Pattern.compile("[0-9a-f]{64}");

 static void initialize(SQLiteDatabase db) {
  db.beginTransaction();
  try {
   db.execSQL("CREATE TABLE IF NOT EXISTS reminder_options (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, snoozes TEXT NOT NULL)");
   db.execSQL("INSERT OR IGNORE INTO reminder_options VALUES (1,0,'{}')");
   db.execSQL("CREATE TABLE IF NOT EXISTS reminder_schedule (occurrence TEXT PRIMARY KEY NOT NULL, day TEXT NOT NULL)");
   db.execSQL("CREATE INDEX IF NOT EXISTS reminder_schedule_day ON reminder_schedule(day)");
   db.execSQL("CREATE TABLE IF NOT EXISTS reminder_delivered (occurrence TEXT PRIMARY KEY NOT NULL)");
   // Every change of primary snapshot discards the derived plan in the same
   // transaction, including restore/recovery and approved balance writes.
   for(String operation : new String[]{"INSERT","UPDATE","DELETE"}) {
    String row=operation.equals("DELETE")?"OLD":"NEW";
    db.execSQL("CREATE TRIGGER IF NOT EXISTS reminder_invalidate_"+operation+" AFTER "+operation
     +" ON snapshots WHEN "+row+".id=1 BEGIN DELETE FROM reminder_schedule; END");
   }
   db.setTransactionSuccessful();
  } finally {
   db.endTransaction();
  }
 }

 static boolean walletWrite(Context context,BooleanSupplier operation) {
  synchronized(LOCK) {
   boolean committed=operation.getAsBoolean();
   if(committed) {
    try { cancel(context,true); }
    catch(RuntimeException e) { Log.w("Reminders","Could not cancel previous reminder"); }
   }
   return committed;
  }
 }

 static boolean enabled(SQLiteDatabase db) {
  return DatabaseUtils.longForQuery(db,"SELECT enabled FROM reminder_options WHERE id=1",null)!=0;
 }

 static String snoozes(SQLiteDatabase db) {
  return DatabaseUtils.stringForQuery(db,"SELECT snoozes FROM reminder_options WHERE id=1",null);
 }

 static boolean replacePlan(SQLiteDatabase db,String before,String next,String raw) throws JSONException {
  if(before==null||next==null||raw==null||next.length()>MAX_DOCUMENT||raw.length()>MAX_DOCUMENT||
     !before.equals(snoozes(db)))return false;
  JSONObject settings=new JSONObject(next);
  for(Iterator<String> keys=settings.keys();keys.hasNext();) {
   String key=keys.next();
   if(!ID.matcher(key).matches()||!validDay(settings.opt(key)))return false;
  }
  JSONArray plan=new JSONArray(raw);
  db.execSQL("DELETE FROM reminder_schedule");
  for(int i=0;i<plan.length();i++) {
   JSONObject entry=plan.getJSONObject(i);
   Object id=entry.opt("occurrence"),day=entry.opt("day");
   if(!(id instanceof String occurrence)||!ID.matcher(occurrence).matches()||!validDay(day))return false;
   db.execSQL("INSERT INTO reminder_schedule VALUES (?,?)",new Object[]{occurrence,day});
  }
  if(!before.equals(next))db.execSQL("UPDATE reminder_options SET snoozes=? WHERE id=1",new Object[]{next});
  return true;
 }

 private static boolean validDay(Object value) {
  if(!(value instanceof String text)||text.length()!=10)return false;
  try { return LocalDate.parse(text).toString().equals(text); }
  catch(DateTimeException e) { return false; }
 }

 static void setEnabled(Context context,SQLiteDatabase db,boolean enabled) {
  db.beginTransaction();
  try {
   db.execSQL("UPDATE reminder_options SET enabled=? WHERE id=1",new Object[]{enabled?1:0});
   if(!enabled)db.execSQL("DELETE FROM reminder_schedule");
   db.setTransactionSuccessful();
  } finally {
   db.endTransaction();
  }
  if(enabled) {
   notifications(context).createNotificationChannel(
    new NotificationChannel(CHANNEL,"Vade hatırlatmaları",NotificationManager.IMPORTANCE_DEFAULT));
  } else {
   cancel(context,true);
  }
 }

 static boolean permissionGranted(Context context) {
  return Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
   ==PackageManager.PERMISSION_GRANTED;
 }

 static boolean canNotify(Context context) {
  NotificationManager manager=notifications(context);
  NotificationChannel channel=manager.getNotificationChannel(CHANNEL);
  return permissionGranted(context)&&manager.areNotificationsEnabled()&&channel!=null&&
   channel.getImportance()!=NotificationManager.IMPORTANCE_NONE;
 }

 static LocalDate nextDay(SQLiteDatabase db,LocalDate today) {
  try(Cursor rows=db.rawQuery("SELECT MIN(day) FROM reminder_schedule s WHERE day>=? "+
    "AND NOT EXISTS (SELECT 1 FROM reminder_delivered d WHERE d.occurrence=s.occurrence)",
    new String[]{today.toString()})) {
   return rows.moveToFirst()&&!rows.isNull(0)?LocalDate.parse(rows.getString(0)):null;
  }
 }

 static long triggerAt(LocalDate day,ZonedDateTime now) {
  long morning=day.atTime(MORNING).atZone(now.getZone()).toInstant().toEpochMilli();
  return Math.max(morning,now.toInstant().toEpochMilli());
 }

 static boolean claimDue(SQLiteDatabase db,LocalDate day) {
  db.beginTransaction();
  try {
   db.execSQL("INSERT OR IGNORE INTO reminder_delivered SELECT occurrence FROM reminder_schedule WHERE day=?",
    new Object[]{day.toString()});
   boolean claimed=DatabaseUtils.longForQuery(db,"SELECT changes()",null)>0;
   db.setTransactionSuccessful();
   return claimed;
  } finally {
   db.endTransaction();
  }
 }

 static void arm(Context context,SQLiteDatabase db) {
  ZonedDateTime now=ZonedDateTime.now();
  LocalDate day=enabled(db)&&canNotify(context)?nextDay(db,now.toLocalDate()):null;
  if(day==null) {
   cancel(context,false);
  } else {
   context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,
    triggerAt(day,now),alarm(context,PendingIntent.FLAG_UPDATE_CURRENT));
  }
 }

 private static PendingIntent alarm(Context context,int flag) {
  return PendingIntent.getBroadcast(context,0,new Intent(context,ReminderScheduler.class).setAction(ALARM_ACTION),
   flag|PendingIntent.FLAG_IMMUTABLE);
 }

 static void cancel(Context context,boolean displayed) {
  PendingIntent alarm=alarm(context,PendingIntent.FLAG_NO_CREATE);
  if(alarm!=null)context.getSystemService(AlarmManager.class).cancel(alarm);
  if(displayed)notifications(context).cancel(NOTIFICATION);
 }

 private static NotificationManager notifications(Context context) {
  return context.getSystemService(NotificationManager.class);
 }

 private static void post(Context context) {
  Intent open=new Intent(context,MainActivity.class).setAction(OPEN_ACTION)
   .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
  PendingIntent tap=PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_IMMUTABLE);
  notifications(context).notify(NOTIFICATION,new Notification.Builder(context,CHANNEL)
   .setSmallIcon(android.R.drawable.ic_popup_reminder)
   .setContentTitle("Hatırlatma").setContentText("Vade takvimini aç.")
   .setContentIntent(tap).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).build());
 }

 static void dispatchDue(Context context,SQLiteDatabase db,ZonedDateTime now) {
  // Every projection is valid on its own civil day. A late alarm may
  // otherwise report a statement settled by a dated payment in the wallet.
  if(!now.toLocalTime().isBefore(MORNING)&&enabled(db)&&canNotify(context)&&
     claimDue(db,now.toLocalDate()))post(context);
 }

 @Override public void onReceive(Context context,Intent intent) {
  String action=intent.getAction();
  boolean deliver=ALARM_ACTION.equals(action);
  if(!deliver&&!Intent.ACTION_BOOT_COMPLETED.equals(action)&&
     !Intent.ACTION_TIME_CHANGED.equals(action)&&!Intent.ACTION_TIMEZONE_CHANGED.equals(action))return;
  PendingResult result=goAsync();
  new Thread(()->{
   try {
    synchronized(LOCK) {
     if(!context.getDatabasePath("wallet.db").isFile())return;
     try(SQLiteDatabase db=SQLiteDatabase.openDatabase(context.getDatabasePath("wallet.db").getPath(),
         null,SQLiteDatabase.OPEN_READWRITE)) {
      if(deliver)dispatchDue(context,db,ZonedDateTime.now());
      arm(context,db);
     }
    }
   } catch(RuntimeException e) {
    Log.w("Reminders","Could not process reminder alarm");
   } finally {
    result.finish();
   }
  },"reminder-alarm").start();
 }
}
