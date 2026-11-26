package com.zagor.ekstre;

import android.app.NotificationManager;
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.file.Files;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ReminderSchedulerTest {
 private static final String ID="a".repeat(64);
 private static final LocalDate DAY=LocalDate.now().plusDays(30);
 private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();

 @Before public void resetSyntheticWallet() {
  context.deleteDatabase("wallet.db");
 }

 private static String wallet(int marker) {
  return "{\"format\":\"ekstre-android\",\"version\":1,\"accounts\":[],\"transactions\":[],"
   + "\"statements\":[],\"budgets\":{},\"subscriptions\":[],\"categories\":[],\"synthetic\":"+marker+"}";
 }

 private static String plan(LocalDate day) {
  return "[{\"occurrence\":\""+ID+"\",\"day\":\""+day+"\"}]";
 }

 private static MainActivity.Bridge bridge(ActivityScenario<MainActivity> scenario) throws Exception {
  AtomicReference<MainActivity.Bridge> result=new AtomicReference<>();
  // Let startup finish with the default, disabled preference before opting in.
  for(int attempt=0;attempt<60;attempt++) {
   CountDownLatch evaluated=new CountDownLatch(1);
   AtomicReference<String> ready=new AtomicReference<>();
   scenario.onActivity(activity->{
    result.set(activity.new Bridge());
    ViewGroup content=activity.findViewById(android.R.id.content);
    WebView web=(WebView)content.getChildAt(0);
    web.evaluateJavascript("typeof window.showReminders==='function'",value->{
     ready.set(value);
     evaluated.countDown();
    });
   });
   assertTrue(evaluated.await(10,TimeUnit.SECONDS));
   if("true".equals(ready.get()))return result.get();
   Thread.sleep(200);
  }
  throw new AssertionError("Reminder WebView did not start");
 }

 @Test public void existingWalletLaunchAndDefaultRemindersLeaveDatabaseByteExact() throws Exception {
  String initial=wallet(1);
  try(SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   db.execSQL("CREATE TABLE snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)");
   db.execSQL("INSERT INTO snapshots VALUES(1,?)",new Object[]{initial});
  }
  byte[] before=Files.readAllBytes(context.getDatabasePath("wallet.db").toPath());
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=SQLiteDatabase.openDatabase(context.getDatabasePath("wallet.db").getPath(),
       null,SQLiteDatabase.OPEN_READONLY)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertEquals(initial,bridge.snapshotSlot(1));
   assertEquals("off",bridge.reminderStatus());
   assertEquals("{}",bridge.reminderSnoozes());
   ReminderScheduler.arm(context,db);
   assertArrayEquals(before,Files.readAllBytes(context.getDatabasePath("wallet.db").toPath()));
   String token=BalanceApprovalStorage.sha256(initial);
   assertFalse(bridge.replaceReminderSchedule(token,"{}","{}",plan(DAY)));
   assertTrue(bridge.replaceReminderSchedule(token,"{}","{}","[]"));
  }
  assertArrayEquals(before,Files.readAllBytes(context.getDatabasePath("wallet.db").toPath()));
 }

 @Test public void firstSnoozeIsAtomicAndKeepsNotificationsOff() throws Exception {
  String snooze="{\""+ID+"\":\""+DAY.plusDays(1)+"\"}";
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertFalse(bridge.replaceReminderSchedule("","{}",snooze,plan(DAY)));
   assertEquals("{}",bridge.reminderSnoozes());
   assertTrue(bridge.replaceReminderSchedule("","{}",snooze,"[]"));
   assertEquals(snooze,bridge.reminderSnoozes());
   assertEquals("off",bridge.reminderStatus());
   assertNull(ReminderScheduler.nextDay(db,DAY));
  }
 }

 @Test public void committedSnapshotInvalidatesOldScheduleAndRejectsAStaleProjection() throws Exception {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.save(wallet(1),""));
   String token=BalanceApprovalStorage.sha256(wallet(1));
   ReminderScheduler.setEnabled(context,db,true);
   assertTrue(bridge.replaceReminderSchedule(token,"{}","{}",plan(DAY)));
   byte[] beforeSync=Files.readAllBytes(context.getDatabasePath("wallet.db").toPath());
   assertTrue(bridge.replaceReminderSchedule(token,"{}","{}",plan(DAY)));
   assertArrayEquals(beforeSync,Files.readAllBytes(context.getDatabasePath("wallet.db").toPath()));
   assertFalse(bridge.save(wallet(2),""));
   assertEquals(DAY,ReminderScheduler.nextDay(db,DAY));
   db.execSQL("CREATE TRIGGER abort_reminder_test_write BEFORE INSERT ON snapshots "+
    "WHEN NEW.id=1 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
   assertFalse(bridge.save(wallet(2),token));
   assertEquals(DAY,ReminderScheduler.nextDay(db,DAY));
   db.execSQL("DROP TRIGGER abort_reminder_test_write");
   assertTrue(bridge.save(wallet(2),token));
   assertNull(ReminderScheduler.nextDay(db,DAY));
   assertFalse(bridge.replaceReminderSchedule(token,"{}","{}",plan(DAY)));
   assertFalse(ReminderScheduler.claimDue(db,DAY));
   String updated=BalanceApprovalStorage.sha256(wallet(2));
   assertTrue(bridge.replaceReminderSchedule(updated,"{}","{}",plan(DAY)));
   assertTrue(bridge.restoreChecked(updated,1,updated,wallet(3)));
   assertFalse(ReminderScheduler.claimDue(db,DAY));
  }
 }

 @Test public void snoozeAndDedupSurviveReopeningTheDatabase() throws Exception {
  String snooze="{\""+ID+"\":\""+DAY.plusDays(1)+"\"}";
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   MainActivity.Bridge bridge=bridge(scenario);
   try(SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
    ReminderScheduler.setEnabled(context,db,true);
    assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
    assertTrue(bridge.replaceReminderSchedule("","{}",snooze,plan(DAY.plusDays(1))));
    assertFalse(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
    assertFalse(ReminderScheduler.claimDue(db,DAY));
    assertTrue(ReminderScheduler.claimDue(db,DAY.plusDays(1)));
   }
   try(SQLiteDatabase reopened=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
    assertTrue(bridge.replaceReminderSchedule("",snooze,snooze,plan(DAY.plusDays(1))));
    assertFalse(ReminderScheduler.claimDue(reopened,DAY.plusDays(1)));
    assertNull(ReminderScheduler.nextDay(reopened,DAY));
   }
  }
 }

 @Test public void disabledOrBlockedNotificationsDoNotConsumeTheOccurrence() throws Exception {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   ZonedDateTime morning=DAY.atTime(10,0).atZone(ZoneId.of("Europe/Istanbul"));
   assertFalse(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   ReminderScheduler.dispatchDue(context,db,morning);
   synchronized(ReminderScheduler.LOCK) {
    ReminderScheduler.setEnabled(context,db,true);
    context.getSystemService(NotificationManager.class).deleteNotificationChannel("wallet_reminders");
    assertEquals("blocked",bridge.reminderStatus());
    assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
    ReminderScheduler.dispatchDue(context,db,morning);
    assertEquals(DAY,ReminderScheduler.nextDay(db,DAY));
    ReminderScheduler.setEnabled(context,db,false);
   }
   assertEquals("off",bridge.reminderStatus());
   assertNull(ReminderScheduler.nextDay(db,DAY));
   assertFalse(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   ReminderScheduler.setEnabled(context,db,true);
   assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   assertTrue(ReminderScheduler.claimDue(db,DAY));
  }
 }

 @Test public void civilAlarmMovesWithTheZoneAndSkipsYesterday() throws Exception {
  ZoneId istanbul=ZoneId.of("Europe/Istanbul"), newYork=ZoneId.of("America/New_York");
  ZonedDateTime now=DAY.atStartOfDay(istanbul);
  assertEquals(DAY.atTime(9,0).atZone(istanbul).toInstant().toEpochMilli(),
   ReminderScheduler.triggerAt(DAY,now));
  assertEquals(DAY.atTime(9,0).atZone(newYork).toInstant().toEpochMilli(),
   ReminderScheduler.triggerAt(DAY,now.withZoneSameInstant(newYork)));
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   ReminderScheduler.setEnabled(context,db,true);
   assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   assertNull(ReminderScheduler.nextDay(db,DAY.plusDays(1)));
   assertFalse(ReminderScheduler.claimDue(db,DAY.plusDays(1)));
  }
 }
}
