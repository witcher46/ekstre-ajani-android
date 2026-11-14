package com.zagor.ekstre;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Android SQLite snapshot failure-injection tests.
 *
 * Only synthetic wallets are used. The trigger forces the final INSERT to
 * fail after the recovery/previous snapshot writes have been attempted.
 * If the native transaction is not atomic, this test will detect corruption.
 */
@RunWith(AndroidJUnit4.class)
public class SnapshotAtomicityTest {
 private static final String TRIGGER="abort_primary_snapshot_for_test";

 @Before public void deleteSyntheticWallet() {
  InstrumentationRegistry.getInstrumentation().getTargetContext().deleteDatabase("wallet.db");
 }

 private String wallet(String marker) {
  return "{\"format\":\"ekstre-android\",\"version\":1,"
   + "\"accounts\":[],\"transactions\":[],\"statements\":[],"
   + "\"budgets\":{},\"subscriptions\":[],\"categories\":[],"
   + "\"syntheticMarker\":\"" + marker + "\"}";
 }

 private MainActivity.Bridge bridge(ActivityScenario<MainActivity> scenario) {
  AtomicReference<MainActivity.Bridge> reference=new AtomicReference<>();
  scenario.onActivity(activity->reference.set(activity.new Bridge()));
  assertNotNull(reference.get());
  return reference.get();
 }

 private String snapshot(SQLiteDatabase database,int id) {
  try(Cursor rows=database.rawQuery("SELECT content FROM snapshots WHERE id=?",
      new String[]{String.valueOf(id)})){
   assertTrue("Synthetic snapshot "+id+" must exist",rows.moveToFirst());
   return rows.getString(0);
  }
 }

 @Test public void failedFinalSqliteWriteRollsBackWalletPreviousAndRecovery() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String first=wallet("first"),current=wallet("current"),candidate=wallet("candidate");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.save(first));
   assertTrue(bridge.restore(current));
   assertEquals(current,bridge.load());
   assertEquals(first,bridge.recovery());

   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
    String previous=snapshot(database,2);
    String recovery=snapshot(database,3);
    assertEquals(first,previous);
    assertEquals(first,recovery);

    // Restoring candidate attempts id=3 and id=2 BEFORE writing id=1.
    // The injected final INSERT failure must roll back all three changes.
    database.execSQL("CREATE TRIGGER "+TRIGGER
      +" BEFORE INSERT ON snapshots WHEN NEW.id=1"
      +" BEGIN SELECT RAISE(ABORT, 'synthetic-final-write-failure'); END");
    try {
     assertFalse("A forced SQLite error must reject the restore",bridge.restore(candidate));
     assertEquals(current,bridge.load());
     assertEquals(first,bridge.recovery());
     assertEquals(current,snapshot(database,1));
     assertEquals(previous,snapshot(database,2));
     assertEquals(recovery,snapshot(database,3));
    } finally {
     database.execSQL("DROP TRIGGER IF EXISTS "+TRIGGER);
    }

    // Prove the database remains writable after the injected failure.
    assertTrue(bridge.restore(candidate));
    assertEquals(candidate,snapshot(database,1));
    assertEquals(current,snapshot(database,2));
    assertEquals(current,snapshot(database,3));
   }
   scenario.recreate();
   MainActivity.Bridge reopened=bridge(scenario);
   assertEquals("The latest valid wallet survives activity recreation",candidate,reopened.load());
   assertEquals("The pre-restore wallet remains recoverable",current,reopened.recovery());
  }
 }

 @Test public void failedFinalSqliteSaveRollsBackThePreviousSnapshot() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String first=wallet("first"),current=wallet("current"),candidate=wallet("candidate");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.save(first));
   assertTrue(bridge.restore(current));
   assertEquals(current,bridge.load());
   assertEquals(first,bridge.recovery());

   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
    String priorPrevious=snapshot(database,2),priorRecovery=snapshot(database,3);
    database.execSQL("CREATE TRIGGER "+TRIGGER
      +" BEFORE INSERT ON snapshots WHEN NEW.id=1"
      +" BEGIN SELECT RAISE(ABORT, 'synthetic-save-failure'); END");
    try {
     assertFalse("Forced SQLite write failure must reject a normal save",bridge.save(candidate));
     assertEquals("Active wallet is intact",current,bridge.load());
     assertEquals("Recovery is intact",first,bridge.recovery());
     assertEquals("Previous snapshot update was rolled back",priorPrevious,snapshot(database,2));
     assertEquals("Restore-only recovery is unchanged",priorRecovery,snapshot(database,3));
    } finally {
     database.execSQL("DROP TRIGGER IF EXISTS "+TRIGGER);
    }
    assertTrue("Normal saves work again after a failure",bridge.save(candidate));
    assertEquals(candidate,bridge.load());
    assertEquals(current,snapshot(database,2));
    assertEquals(first,snapshot(database,3));
   }
   scenario.recreate();
   assertEquals("Saved wallet survives activity recreation",candidate,bridge(scenario).load());
  }
 }

 @Test public void malformedRestoreDoesNotReplaceWalletOrRecovery() {
  String first=wallet("first"),current=wallet("current");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.save(first));
   assertTrue(bridge.restore(current));

   String invalidVersion=wallet("unsupported").replace("\"version\":1","\"version\":2");
   String missingArray=wallet("broken").replace("\"transactions\":[]","\"transactions\":null");
   for(String invalid:new String[]{"{invalid JSON",invalidVersion,missingArray}) {
    assertFalse("Malformed/unsupported native restore must fail",bridge.restore(invalid));
    assertEquals(current,bridge.load());
    assertEquals(first,bridge.recovery());
   }
   scenario.recreate();
   MainActivity.Bridge reopened=bridge(scenario);
   assertEquals(current,reopened.load());
   assertEquals(first,reopened.recovery());
  }
 }
}
