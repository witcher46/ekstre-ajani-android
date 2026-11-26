package com.zagor.ekstre;

import android.app.NotificationManager;
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ReminderSchedulerTest {
 private static final String ID="a".repeat(64);
 private static final LocalDate DAY=LocalDate.of(2026,11,30);
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

 private static MainActivity.Bridge bridge(ActivityScenario<MainActivity> scenario) {
  AtomicReference<MainActivity.Bridge> result=new AtomicReference<>();
  scenario.onActivity(activity->result.set(activity.new Bridge()));
  return result.get();
 }

 @Test public void committedSnapshotInvalidatesOldScheduleAndRejectsAStaleProjection() {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.save(wallet(1),""));
   String token=BalanceApprovalStorage.sha256(wallet(1));
   assertTrue(bridge.replaceReminderSchedule(token,"{}","{}",plan(DAY)));
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

 @Test public void snoozeAndDedupSurviveReopeningTheDatabase() {
  String snooze="{\""+ID+"\":\""+DAY.plusDays(1)+"\"}";
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   assertTrue(bridge.replaceReminderSchedule("","{}",snooze,plan(DAY.plusDays(1))));
   assertFalse(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   try(SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
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

 @Test public void disabledOrBlockedNotificationsDoNotConsumeTheOccurrence() {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   ZonedDateTime morning=DAY.atTime(10,0).atZone(ZoneId.of("Europe/Istanbul"));
   assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   ReminderScheduler.dispatchDue(context,db,morning);
   assertEquals(DAY,ReminderScheduler.nextDay(db,DAY));
   synchronized(ReminderScheduler.LOCK) {
    ReminderScheduler.setEnabled(context,db,true);
    context.getSystemService(NotificationManager.class).deleteNotificationChannel("wallet_reminders");
    assertEquals("blocked",bridge.reminderStatus());
    ReminderScheduler.dispatchDue(context,db,morning);
    assertEquals(DAY,ReminderScheduler.nextDay(db,DAY));
    ReminderScheduler.setEnabled(context,db,false);
   }
   assertEquals("off",bridge.reminderStatus());
   assertNull(ReminderScheduler.nextDay(db,DAY));
   assertTrue(bridge.replaceReminderSchedule("","{}","{}",plan(DAY)));
   assertTrue(ReminderScheduler.claimDue(db,DAY));
  }
 }

 @Test public void civilAlarmMovesWithTheZoneAndSkipsYesterday() {
  ZoneId istanbul=ZoneId.of("Europe/Istanbul"), newYork=ZoneId.of("America/New_York");
  ZonedDateTime now=DAY.atStartOfDay(istanbul);
  assertEquals(DAY.atTime(9,0).atZone(istanbul).toInstant().toEpochMilli(),
   ReminderScheduler.triggerAt(DAY,now));
  assertEquals(DAY.atTime(9,0).atZone(newYork).toInstant().toEpochMilli(),
   ReminderScheduler.triggerAt(DAY,now.withZoneSameInstant(newYork)));
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   assertTrue(bridge(scenario).replaceReminderSchedule("","{}","{}",plan(DAY)));
   assertNull(ReminderScheduler.nextDay(db,DAY.plusDays(1)));
   assertFalse(ReminderScheduler.claimDue(db,DAY.plusDays(1)));
  }
 }
}
