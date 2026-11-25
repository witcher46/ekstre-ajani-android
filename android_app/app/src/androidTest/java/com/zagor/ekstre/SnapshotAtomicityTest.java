package com.zagor.ekstre;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
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

 static boolean saveFixture(MainActivity.Bridge bridge,String next){
  String current=bridge.snapshotSlot(1);
  return bridge.save(next,current==null?"":BalanceApprovalStorage.sha256(current));
 }

 @Test public void staleOrdinaryWritePreservesEverySnapshot() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String recovery=wallet("recovery"),base=wallet("base"),stale=wallet("stale edit");
  String newer=base.replace("\"budgets\":{}","\"budgets\":{\"2026-10|Toplam\":12345}");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(bridge.save(recovery,""));
   assertFalse(bridge.save(stale,""));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,base));
   String expected=BalanceApprovalStorage.sha256(base);
   assertTrue(bridge.save(newer,expected));
   assertFalse(bridge.save(stale,expected));
   assertEquals(newer,snapshot(db,1));
   assertEquals(base,snapshot(db,2));
   assertEquals(recovery,snapshot(db,3));
  }
 }

 private String snapshot(SQLiteDatabase database,int id) {
  try(Cursor rows=database.rawQuery("SELECT content FROM snapshots WHERE id=?",
      new String[]{String.valueOf(id)})){
   assertTrue("Synthetic snapshot "+id+" must exist",rows.moveToFirst());
   return rows.getString(0);
  }
 }

 @Test public void duplicateBackupIdsPreserveEverySnapshot() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String previous=wallet("previous"),current=wallet("current");
  String valid=wallet("backup").replace("\"accounts\":[]",
    "\"accounts\":[{\"id\":\"card\",\"name\":\"Synthetic\",\"type\":\"card\",\"opening\":0}]");
  String subscription="{\"id\":\"sub\",\"name\":\"Synthetic\",\"account\":\"card\",\"next\":\"2026-10-15\",\"amount\":1500}";
  String statement="{\"id\":\"statement\",\"account\":\"card\",\"cut\":\"2026-10-05\",\"period\":\"2026-10\",\"debt\":8000,\"due\":null}";
  String duplicateSubscription=valid.replace("\"subscriptions\":[]", "\"subscriptions\":["+subscription+","+subscription+"]");
  String duplicateStatement=valid.replace("\"statements\":[]", "\"statements\":["+statement+","+statement+"]");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,previous));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
   for(String invalid:new String[]{duplicateSubscription,duplicateStatement}) {
    assertFalse(RecoverySafetyTest.restoreFixture(bridge,invalid));
    assertEquals(current,snapshot(db,1));
    assertEquals(previous,snapshot(db,2));
    assertEquals(previous,snapshot(db,3));
   }
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,valid));
  }
 }

 @Test public void invalidBackupTargetPreservesEverySnapshot() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String previous=wallet("previous");
  String current=wallet("current").replace("\"accounts\":[]", "\"accounts\":["
    +"{\"id\":\"bank\",\"name\":\"Synthetic bank\",\"type\":\"bank\",\"opening\":10000},"
    +"{\"id\":\"cash\",\"name\":\"Synthetic cash\",\"type\":\"cash\",\"opening\":0}]");
  String expense="{\"id\":\"expense\",\"kind\":\"expense\",\"account\":\"bank\",\"date\":\"2026-10-01\","
    +"\"period\":\"2026-10\",\"desc\":\"Synthetic expense\",\"amount\":2000,\"category\":\"Diğer\",\"target\":\"cash\"}";
  String invalid=current.replace("\"transactions\":[]","\"transactions\":["+expense+"]");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,previous));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,invalid));
   assertEquals(current,snapshot(db,1));
   assertEquals(previous,snapshot(db,2));
   assertEquals(previous,snapshot(db,3));
   String validTransfer=invalid.replace("\"kind\":\"expense\"","\"kind\":\"transfer\"");
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,validTransfer));
  }
 }

 private String observedWallet(String marker) {
  return wallet(marker).replace("\"version\":1","\"version\":2")
   .replace("\"accounts\":[]","\"accounts\":[{\"id\":\"bank\",\"name\":\"Synthetic\",\"type\":\"bank\",\"opening\":0}]")
   .replace("\"transactions\":[]","\"transactions\":[],\"balanceReconciliation\":{\"observations\":[{"
    + "\"id\":\"observation-" + marker + "\",\"accountId\":\"bank\",\"role\":\"observation\","
    + "\"observedDate\":\"2026-11-14\",\"observedAmountCents\":-9007199254740991,\"sourceKind\":\"bankDocument\","
    + "\"createdAt\":\"2026-11-14T10:00:00.000Z\",\"updatedAt\":\"2026-11-15T11:00:00.000Z\"}]}");
 }

 @Test public void observationSnapshotsSurviveRestoreAndWriteFailure() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String original=observedWallet("original"),edited=observedWallet("edited");
  String nested="0";
  for(int i=0;i<300;i++)nested="["+nested+"]";
  String legacy=wallet("legacy").replace("\"accounts\":[]","\"accounts\":[],\"extra\":"+nested);
  String unicodeName=edited.replace("\"name\":\"Synthetic\"","\"name\":\"\u0085\"");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,unicodeName));
   assertTrue(saveFixture(bridge,original));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,edited));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("\"accountId\":\"bank\"","\"accountId\":\"missing\"")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("\"id\":\"bank\"","\"id\":123")
    .replace("\"accountId\":\"bank\"","\"accountId\":\"123\"")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("\"opening\":0}]","\"opening\":0},{\"id\":\"bank\",\"type\":\"bank\"}]")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("2026-11-14\"","2026-02-30\"")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("-9007199254740991","-9007199254740992")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited+" trailing"));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("\"version\"","'version'")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("syntheticMarker\":\"edited", "syntheticMarker\":\"\\q")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("syntheticMarker\":\"edited", "syntheticMarker\":\"line\nbreak")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("syntheticMarker\":\"edited", "syntheticMarker\":\"zero"+(char)0)));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,"\uFEFF"+edited));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("\"transactions\":[]","\"transactions\":[null]")));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,edited.replace("\"opening\":0","\"opening\":\"bad\"")));
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    assertEquals(edited,snapshot(database,1));
    assertEquals(original,snapshot(database,2));
    assertEquals(original,snapshot(database,3));
    database.execSQL("CREATE TRIGGER "+TRIGGER+" BEFORE INSERT ON snapshots WHEN NEW.id=1"
     +" BEGIN SELECT RAISE(ABORT, 'synthetic-observation-write-failure'); END");
    try{
     assertFalse(RecoverySafetyTest.restoreFixture(bridge,legacy));
     assertEquals(edited,snapshot(database,1));
     assertEquals(original,snapshot(database,2));
     assertEquals(original,snapshot(database,3));
    } finally {
     database.execSQL("DROP TRIGGER IF EXISTS "+TRIGGER);
    }
    assertTrue(RecoverySafetyTest.restoreFixture(bridge,legacy));
    assertEquals(legacy,snapshot(database,1));
    assertEquals(edited,snapshot(database,2));
    assertEquals(edited,snapshot(database,3));
   }
   scenario.recreate();
   MainActivity.Bridge reopened=bridge(scenario);
   assertEquals(edited,reopened.recovery());
   assertTrue(saveFixture(reopened,reopened.recovery()));
   scenario.recreate();
   assertEquals(edited,bridge(scenario).load());
  }
 }

 @Test public void largeObservationBackupSurvivesAndOversizeRestoreIsRejected() {
  String small=observedWallet("large");
  int start=small.indexOf("{\"id\":\"observation-large\"");
  int end=small.indexOf("}]",start)+1;
  String row=small.substring(start,end);
  StringBuilder rows=new StringBuilder();
  for(int i=0;i<5000;i++){
   if(i>0)rows.append(',');
   rows.append(row.replace("observation-large","observation-"+i));
  }
  String large=small.substring(0,start)+rows+small.substring(end);
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,small));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,large));
   assertEquals(large,bridge.load());
   assertEquals(small,bridge.recovery());

   // Two UTF-8 bytes per character, with a character count below the byte limit.
   String prefix=small.substring(0,small.length()-1)+",\"padding\":\"";
   String suffix="\"}";
   int remaining=32_000_000-(prefix+suffix).getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
   char[] padding=new char[remaining/2];
   java.util.Arrays.fill(padding,'ü');
   String atLimit=prefix+new String(padding)+(remaining%2==1?"a":"")+suffix;
   assertTrue(saveFixture(bridge,atLimit));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,atLimit+" "));
   assertEquals(atLimit,bridge.load());
   assertEquals(small,bridge.recovery());
  }
 }

 @Test public void failedFinalSqliteWriteRollsBackWalletPreviousAndRecovery() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String first=wallet("first"),current=wallet("current"),candidate=wallet("candidate");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,first));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
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
     assertFalse("A forced SQLite error must reject the restore",RecoverySafetyTest.restoreFixture(bridge,candidate));
     assertEquals(current,bridge.load());
     assertEquals(first,bridge.recovery());
     assertEquals(current,snapshot(database,1));
     assertEquals(previous,snapshot(database,2));
     assertEquals(recovery,snapshot(database,3));
    } finally {
     database.execSQL("DROP TRIGGER IF EXISTS "+TRIGGER);
    }

    // Prove the database remains writable after the injected failure.
    assertTrue(RecoverySafetyTest.restoreFixture(bridge,candidate));
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
   assertTrue(saveFixture(bridge,first));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
   assertEquals(current,bridge.load());
   assertEquals(first,bridge.recovery());

   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)) {
    String priorPrevious=snapshot(database,2),priorRecovery=snapshot(database,3);
    database.execSQL("CREATE TRIGGER "+TRIGGER
      +" BEFORE INSERT ON snapshots WHEN NEW.id=1"
      +" BEGIN SELECT RAISE(ABORT, 'synthetic-save-failure'); END");
    try {
     assertFalse("Forced SQLite write failure must reject a normal save",saveFixture(bridge,candidate));
     assertEquals("Active wallet is intact",current,bridge.load());
     assertEquals("Recovery is intact",first,bridge.recovery());
     assertEquals("Previous snapshot update was rolled back",priorPrevious,snapshot(database,2));
     assertEquals("Restore-only recovery is unchanged",priorRecovery,snapshot(database,3));
    } finally {
     database.execSQL("DROP TRIGGER IF EXISTS "+TRIGGER);
    }
    assertTrue("Normal saves work again after a failure",saveFixture(bridge,candidate));
    assertEquals(candidate,bridge.load());
    assertEquals(current,snapshot(database,2));
    assertEquals(first,snapshot(database,3));
   }
   scenario.recreate();
   assertEquals("Saved wallet survives activity recreation",candidate,bridge(scenario).load());
  }
 }

 @Test public void compareAndSwapRejectsStaleSnapshotAndKeepsRecovery() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String first=wallet("cas-first"),current=wallet("cas-current"),candidate=wallet("cas-candidate");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,first));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
   String read=bridge.loadForCompare();
   assertEquals(current,read.substring(65));
   String token=read.substring(0,64);

   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    // Use a separate SQLite connection, bypassing the bridge's Java lock.
    // It commits after the read but before the compare-and-swap transaction.
    String changed=wallet("cas-external");
    database.execSQL("UPDATE snapshots SET content=? WHERE id=1",new Object[]{changed});
    assertFalse(bridge.saveIfUnchanged(token,candidate));
    assertEquals(changed,snapshot(database,1));
    assertEquals(first,snapshot(database,2));
    assertEquals(first,snapshot(database,3));

    String latest=bridge.loadForCompare().substring(0,64);
    assertTrue(bridge.saveIfUnchanged(latest,candidate));
    assertFalse(bridge.saveIfUnchanged(latest,wallet("cas-competing")));
    assertEquals(candidate,snapshot(database,1));
    assertEquals(changed,snapshot(database,2));
    assertEquals(first,snapshot(database,3));
   }
  }
 }

 @Test public void compareAndSwapFinalWriteFailureRollsBackAllSnapshots() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String first=wallet("cas-recovery"),current=wallet("cas-current"),candidate=wallet("cas-retry");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,first));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
   String token=bridge.loadForCompare().substring(0,64);
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    database.execSQL("CREATE TRIGGER "+TRIGGER+" BEFORE INSERT ON snapshots WHEN NEW.id=1"
     +" BEGIN SELECT RAISE(ABORT, 'synthetic-cas-write-failure'); END");
    try{
     assertFalse(bridge.saveIfUnchanged(token,candidate));
     assertEquals(current,snapshot(database,1));
     assertEquals(first,snapshot(database,2));
     assertEquals(first,snapshot(database,3));
    }finally{database.execSQL("DROP TRIGGER IF EXISTS "+TRIGGER);}
    assertTrue(bridge.saveIfUnchanged(token,candidate));
    assertEquals(candidate,snapshot(database,1));
   }
   scenario.recreate();
   assertEquals(candidate,bridge(scenario).load());
   assertEquals(first,bridge(scenario).recovery());
  }
 }

 @Test public void compareAndSwapChecksTokenAfterTakingSqliteWriteLock() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String current=wallet("cas-blocked"),changed=wallet("cas-external-commit");
  var executor=java.util.concurrent.Executors.newSingleThreadExecutor();
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,current));
   String token=bridge.loadForCompare().substring(0,64);
   java.util.concurrent.Future<Boolean> attempted;
   database.beginTransactionNonExclusive();
   try{
    database.execSQL("UPDATE snapshots SET content=? WHERE id=1",new Object[]{changed});
    attempted=executor.submit(()->bridge.saveIfUnchanged(token,wallet("cas-stale")));
    try{
     attempted.get(250,java.util.concurrent.TimeUnit.MILLISECONDS);
     fail("The separate writer must still hold SQLite's write lock");
    }catch(java.util.concurrent.TimeoutException expected){
     database.setTransactionSuccessful();
    }
   }finally{database.endTransaction();}
   assertFalse(attempted.get(5,java.util.concurrent.TimeUnit.SECONDS));
   assertEquals(changed,snapshot(database,1));
  }finally{executor.shutdownNow();}
 }

 private String syntheticApprovalBackup() throws Exception {
  try(var input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("synthetic-reconciliation-v3.json");
      var output=new java.io.ByteArrayOutputStream()){
   byte[] buffer=new byte[4096];
   for(int count;(count=input.read(buffer))!=-1;)output.write(buffer,0,count);
   return new String(output.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
  }
 }

 @Test public void onlyOneConcurrentApprovalCanAppendToTheSameSnapshot() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String first=syntheticApprovalBackup(),recovery=wallet("before-v2");
  JSONObject v2=new JSONObject(first);
  v2.put("version",2);
  v2.getJSONObject("balanceReconciliation").remove("approvals");
  String current=v2.toString();
  JSONObject alternative=new JSONObject(first);
  alternative.getJSONObject("balanceReconciliation").getJSONArray("approvals")
   .getJSONObject(0).put("id","approval-2");
  String second=alternative.toString();
  var executor=Executors.newFixedThreadPool(2);
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,recovery));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));
   String comparison=bridge.loadForCompare();
   assertEquals(current,comparison.substring(65));
   String token=comparison.substring(0,64);
   CountDownLatch ready=new CountDownLatch(2),start=new CountDownLatch(1);
   var saveFirst=executor.submit(()->{
    ready.countDown();
    assertTrue(start.await(5,TimeUnit.SECONDS));
    return bridge.saveIfUnchanged(token,first);
   });
   var saveSecond=executor.submit(()->{
    ready.countDown();
    assertTrue(start.await(5,TimeUnit.SECONDS));
    return bridge.saveIfUnchanged(token,second);
   });
   assertTrue(ready.await(5,TimeUnit.SECONDS));
   start.countDown();
   boolean committedFirst=saveFirst.get(10,TimeUnit.SECONDS);
   boolean committedSecond=saveSecond.get(10,TimeUnit.SECONDS);
   assertTrue("Exactly one valid v3 candidate must win the same v2 token",committedFirst^committedSecond);
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    assertEquals(committedFirst?first:second,snapshot(database,1));
    assertEquals(current,snapshot(database,2));
    assertEquals(recovery,snapshot(database,3));
   }
  }finally{
   executor.shutdownNow();
  }
 }

 @Test public void approvalBackupSurvivesNativeRestoreAndRejectsTampering() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String raw=syntheticApprovalBackup();
  String initial=wallet("before-evidence");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,initial));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,raw));
   assertEquals(raw,bridge.load());
   assertEquals(initial,bridge.recovery());
   String token=bridge.loadForCompare().substring(0,64);
   String emptyHistory=raw.replaceFirst("\"approvals\":\\[.*\\]\\}\\}$","\"approvals\":[]}}");
   assertNotEquals(raw,emptyHistory);
   assertFalse(saveFixture(bridge,initial));
   assertFalse(saveFixture(bridge,emptyHistory));
   assertFalse(bridge.saveIfUnchanged(token,emptyHistory));
   assertFalse(bridge.saveIfUnchanged(token,initial));
   assertFalse(bridge.recoverSnapshot(3,"0".repeat(64),token,true));
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,raw.replace("satır-1","satır-2")));

   var forged=new org.json.JSONObject(raw);
   var proof=forged.getJSONObject("balanceReconciliation").getJSONArray("approvals").getJSONObject(0);
   String canonical=proof.getString("evidenceJson");
   for(String invalid:new String[]{
    canonical.replace("\"version\":1","\"version\":2"),
    canonical.replace("Europe/Istanbul","Imaginary/Unknown"),
    canonical.replace("Europe/Istanbul","GMT+5"),
    canonical.replace("\"date\":\"2026-11-10\"","\"date\":\"2000-01-01\""),
    canonical.replace("\"kind\":\"income\"","\"kind\":\"expense\""),
    canonical.replace("\"matchStatus\":null","\"matchStatus\":\"linked\"")
   }){
    assertNotEquals(canonical,invalid);
    proof.put("evidenceJson",invalid);
    proof.put("evidenceSha256",BalanceApprovalStorage.sha256(invalid));
    assertFalse(RecoverySafetyTest.restoreFixture(bridge,forged.toString()));
   }
   assertFalse(RecoverySafetyTest.restoreFixture(bridge,raw.replace("\"version\":3","\"version\":4")));

   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    assertEquals(raw,snapshot(database,1));
    assertEquals(initial,snapshot(database,2));
    assertEquals(initial,snapshot(database,3));
   }
   scenario.recreate();
   MainActivity.Bridge reopened=bridge(scenario);
   assertEquals(raw,reopened.load());
   assertTrue(reopened.recoverSnapshot(3,BalanceApprovalStorage.sha256(initial),BalanceApprovalStorage.sha256(reopened.load()),true));
   assertEquals(initial,reopened.load());
   assertEquals(initial,reopened.recovery());
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    assertEquals(raw,snapshot(database,2));
   }
   String alternateCase=canonical.replace("Europe/Istanbul","europe/istanbul");
   proof.put("evidenceJson",alternateCase);
   proof.put("evidenceSha256",BalanceApprovalStorage.sha256(alternateCase));
   assertTrue(RecoverySafetyTest.restoreFixture(reopened,forged.toString()));
   String payment=canonical.replace("synthetic-income","synthetic-payment")
    .replace("\"kind\":\"income\"","\"kind\":\"payment\"")
    .replace("\"targetId\":null","\"targetId\":\"card\"")
    .replace("\"effectCents\":\"100\"","\"effectCents\":\"-100\"")
    .replace("9007199254741091","9007199254740891")
    .replace("-18014398509482082","-18014398509481882");
   String alias="{\"id\":\"synthetic-pdf\",\"date\":\"2026-11-10\",\"kind\":\"cardPayment\",\"accountId\":\"card\","
    +"\"targetId\":null,\"amountCents\":\"100\",\"source\":\"pdf\",\"included\":false,\"effectCents\":null,"
    +"\"matchStatus\":\"linked\",\"linkedTo\":\"synthetic-payment\",\"previousLinkedTo\":null,\"matchCandidates\":[]}";
   String linked=payment.substring(0,payment.length()-2)+","+alias+"]}";
   proof.put("evidenceJson",linked);
   proof.put("evidenceSha256",BalanceApprovalStorage.sha256(linked));
   String accepted=forged.toString();
   assertTrue(RecoverySafetyTest.restoreFixture(reopened,accepted));
   String invalidLink=payment.substring(0,payment.length()-2)+","+alias.replace("\"100\"","\"101\"")+"]}";
   proof.put("evidenceJson",invalidLink);
   proof.put("evidenceSha256",BalanceApprovalStorage.sha256(invalidLink));
   String recoveryBefore=reopened.recovery();
   assertFalse(RecoverySafetyTest.restoreFixture(reopened,forged.toString()));
   assertEquals(accepted,reopened.load());
   assertEquals(recoveryBefore,reopened.recovery());
  }
 }

 @Test public void malformedRestoreDoesNotReplaceWalletOrRecovery() {
  String first=wallet("first"),current=wallet("current");
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   MainActivity.Bridge bridge=bridge(scenario);
   assertTrue(saveFixture(bridge,first));
   assertTrue(RecoverySafetyTest.restoreFixture(bridge,current));

   String invalidVersion=wallet("unsupported").replace("\"version\":1","\"version\":3");
   String missingObservations=wallet("incomplete").replace("\"version\":1","\"version\":2");
   String missingArray=wallet("broken").replace("\"transactions\":[]","\"transactions\":null");
   for(String invalid:new String[]{"{invalid JSON",invalidVersion,missingObservations,missingArray}) {
    assertFalse("Malformed/unsupported native restore must fail",RecoverySafetyTest.restoreFixture(bridge,invalid));
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
