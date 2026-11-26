package com.zagor.ekstre;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class RecoverySafetyTest {
 private static final String GOOD = "{\"format\":\"ekstre-android\",\"version\":1,"
  + "\"accounts\":[{\"id\":\"a\",\"name\":\"Recovery\",\"type\":\"cash\",\"opening\":74325}],"
  + "\"transactions\":[],\"statements\":[],\"subscriptions\":[],\"categories\":[],\"budgets\":{}}";
 private static final String EXTERNAL = GOOD.replace("Recovery","External").replace("74325","100");
 private static final String DAMAGED = "{synthetic-unreadable";
 private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

 @Before public void resetWallet() {
  context.deleteDatabase("wallet.db");
 }

 private void seed(SQLiteDatabase db,String... slots) {
  db.beginTransaction();
  try {
   for(int i=0;i<slots.length;i++) {
    db.execSQL("INSERT OR REPLACE INTO snapshots(id,content) VALUES(?,?)",new Object[]{i+1,slots[i]});
   }
   db.setTransactionSuccessful();
  } finally { db.endTransaction(); }
 }

 private String[] rawSlots(SQLiteDatabase db) {
  String[] result = new String[3];
  try(var rows=db.rawQuery("SELECT id,content FROM snapshots ORDER BY id",null)) {
   while(rows.moveToNext()) result[rows.getInt(0)-1]=rows.getString(1);
  }
  return result;
 }

 private String js(ActivityScenario<MainActivity> scenario,String script) throws Exception {
  CountDownLatch done=new CountDownLatch(1);
  AtomicReference<String> result=new AtomicReference<>();
  scenario.onActivity(activity->{
   WebView web=(WebView)((ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0);
   web.evaluateJavascript(script,value->{result.set(value);done.countDown();});
  });
  assertTrue(done.await(12,TimeUnit.SECONDS));
  return result.get();
 }

 private void waitFor(ActivityScenario<MainActivity> scenario,String condition) throws Exception {
  for(int i=0;i<65;i++) {
   if("true".equals(js(scenario,condition))) return;
   Thread.sleep(200);
  }
  fail("WebView did not satisfy " + condition);
 }

 // Existing fixture callers use known-valid current wallets.
 static boolean restoreFixture(MainActivity.Bridge bridge,String next){
  String current=bridge.snapshotSlot(1);
  String token=current==null?"":BalanceApprovalStorage.sha256(current);
  return bridge.restoreChecked(token,current==null?0:1,token,next);
 }

 @Test public void webViewDistinguishesMissingEmptyAndUnreadableSlots() throws Exception {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",0,null)) {
   // The startup fallback has a heading before the app renders and reveals navigation.
   waitFor(scenario,"!!document.querySelector('#nav:not([hidden])')");
   assertEquals("true",js(scenario,"[1,2,3].every(slot=>Android.snapshotSlot(slot)===undefined)"));
   assertEquals("true",js(scenario,"!!document.querySelector('[data-action=addAccount]')"));
   js(scenario,"document.querySelector('#settings').click()");
   assertEquals("true",js(scenario,"!!document.querySelector('[data-action=demo]') && !!document.querySelector('[data-action=backup]')"));

   db.execSQL("ALTER TABLE snapshots RENAME TO unavailable_snapshots");
   try {
    assertEquals("true",js(scenario,"(()=>{try{Android.snapshotSlot(1);return false;}catch{return true;}})()"));
    scenario.onActivity(activity->((WebView)((ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0)).reload());
    waitFor(scenario,"document.querySelector('main h1')?.textContent==='Cüzdan kurtarma'");
    assertEquals("0",js(scenario,"document.querySelectorAll('[data-action=backup]').length"));
   } finally { db.execSQL("ALTER TABLE unavailable_snapshots RENAME TO snapshots"); }

   seed(db,"",DAMAGED,GOOD);
   scenario.recreate();
   waitFor(scenario,"!!document.querySelector('[data-action=recover][data-slot=\"3\"]')");
   assertEquals("true",js(scenario,"Android.snapshotSlot(1)===''"));
   assertEquals("0",js(scenario,"document.querySelectorAll('[data-action=backup]').length"));
  }
 }

 @Test public void approvedRecoveryRestores74325AfterRecreation() throws Exception {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",0,null)) {
   seed(db,DAMAGED,DAMAGED+"2",GOOD);
   scenario.recreate();
   waitFor(scenario,"!!document.querySelector('#nav:not([hidden])')");
   js(scenario,"document.querySelector('#settings').click()");
   waitFor(scenario,"!!document.querySelector('[data-action=recover]')");
   js(scenario,"window.confirm=()=>false;document.querySelector('[data-action=recover]').click()");
   assertArrayEquals(new String[]{DAMAGED,DAMAGED+"2",GOOD},rawSlots(db));
   js(scenario,"window.confirm=()=>true;document.querySelector('[data-action=recover]').click()");
   waitFor(scenario,"Android.load()==="+JSONObject.quote(GOOD));
   assertEquals(GOOD,rawSlots(db)[2]);
   scenario.recreate();
   waitFor(scenario,"!!document.querySelector('[data-action=addTransaction]')");
   assertEquals("74325",js(scenario,"JSON.parse(Android.load()).accounts[0].opening"));
  }
 }

 @Test public void externalRestoreKeepsOnlyReadableCopyFromEitherSlot() {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",0,null)) {
   AtomicReference<MainActivity.Bridge> ref=new AtomicReference<>();
   scenario.onActivity(activity->ref.set(activity.new Bridge()));
   MainActivity.Bridge bridge=ref.get();
   for(int slot:new int[]{2,3}) {
    seed(db,DAMAGED,slot==2?GOOD:DAMAGED+"2",slot==3?GOOD:DAMAGED+"3");
    String[] before=rawSlots(db);
    String source=BalanceApprovalStorage.sha256(GOOD);
    String current=BalanceApprovalStorage.sha256(DAMAGED);
    assertFalse(bridge.restoreChecked(source,slot,source,EXTERNAL));
    assertFalse(bridge.restoreChecked(current,slot,current,EXTERNAL));
    assertArrayEquals(before,rawSlots(db));
    assertTrue(bridge.restoreChecked(current,slot,source,EXTERNAL));
    assertEquals(EXTERNAL,rawSlots(db)[0]);
    assertEquals(GOOD,rawSlots(db)[slot-1]);
   }
  }
 }

 @Test public void malformedUtf8DoesNotHideTheVerifiedRecoveryCopy() throws Exception {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",0,null)) {
   seed(db,DAMAGED,DAMAGED+"2",GOOD);
   byte[] malformed=GOOD.getBytes(StandardCharsets.UTF_8);
   malformed[GOOD.indexOf("Recovery")]=(byte)0xff;
   db.execSQL("UPDATE snapshots SET content=CAST(? AS TEXT) WHERE id=1",new Object[]{malformed});
   scenario.recreate();
   waitFor(scenario,"document.querySelector('main h1')?.textContent==='Cüzdan kurtarma'");
   assertEquals("0",js(scenario,"document.querySelectorAll('[data-action=backup]').length"));
   js(scenario,"window.confirm=()=>true;document.querySelector('[data-action=recover][data-slot=\"3\"]').click()");
   waitFor(scenario,"Android.load()==="+JSONObject.quote(GOOD));
   assertArrayEquals(new String[]{GOOD,DAMAGED+"2",GOOD},rawSlots(db));
  }
 }

 @Test public void failedRecoveryAndRestoreRollBackEverySlot() {
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
      SQLiteDatabase db=context.openOrCreateDatabase("wallet.db",0,null)) {
   AtomicReference<MainActivity.Bridge> ref=new AtomicReference<>();
   scenario.onActivity(activity->ref.set(activity.new Bridge()));
   MainActivity.Bridge bridge=ref.get();
   seed(db,DAMAGED,GOOD,DAMAGED+"3");
   String[] before=rawSlots(db);
   String current=BalanceApprovalStorage.sha256(DAMAGED),source=BalanceApprovalStorage.sha256(GOOD);
   assertFalse(bridge.recoverSnapshot(2,current,current,false));
   assertFalse(bridge.recoverSnapshot(2,source,source,false));
   assertArrayEquals(before,rawSlots(db));
   db.execSQL("CREATE TRIGGER abort_final_recovery BEFORE INSERT ON snapshots WHEN NEW.id=1"
     +" BEGIN SELECT RAISE(ABORT,'synthetic-recovery-failure'); END");
   try {
    assertFalse(bridge.restoreChecked(current,2,source,EXTERNAL));
    assertArrayEquals(before,rawSlots(db));
    assertFalse(bridge.recoverSnapshot(2,source,current,false));
    assertArrayEquals(before,rawSlots(db));
   } finally { db.execSQL("DROP TRIGGER abort_final_recovery"); }
   assertTrue(bridge.recoverSnapshot(2,source,current,false));
   assertArrayEquals(new String[]{GOOD,GOOD,DAMAGED+"3"},rawSlots(db));
   seed(db,EXTERNAL,GOOD,DAMAGED+"3");
   before=rawSlots(db);
   db.execSQL("CREATE TRIGGER abort_recovery_after_rotation BEFORE INSERT ON snapshots WHEN NEW.id=1"
     +" BEGIN SELECT RAISE(ABORT,'synthetic-recovery-rotation-failure'); END");
   try {
    assertFalse("Recovery must fail after rotating the verified current slot",
      bridge.recoverSnapshot(2,source,BalanceApprovalStorage.sha256(EXTERNAL),true));
    assertArrayEquals(before,rawSlots(db));
   } finally { db.execSQL("DROP TRIGGER abort_recovery_after_rotation"); }
  }
 }

 private byte[] bytes(Uri uri) throws Exception {
  try(InputStream in=context.getContentResolver().openInputStream(uri);
      ByteArrayOutputStream out=new ByteArrayOutputStream()) {
   byte[] buffer=new byte[2048];
   for(int count;(count=in.read(buffer))!=-1;) out.write(buffer,0,count);
   return out.toByteArray();
  }
 }

 @Test public void recreatedExportKeepsEveryByteOfExistingDestination() throws Exception {
  byte[] original="synthetic previous backup: ₺743,25\n".getBytes(StandardCharsets.UTF_8);
  ContentValues values=new ContentValues();
  values.put(MediaStore.MediaColumns.DISPLAY_NAME,"RecoverySafety-"+System.nanoTime()+".json");
  values.put(MediaStore.MediaColumns.MIME_TYPE,"application/json");
  Uri uri=context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
  assertNotNull(uri);
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   try(OutputStream out=context.getContentResolver().openOutputStream(uri)) { out.write(original); }
   scenario.recreate();
   waitFor(scenario,"typeof window.nativeError==='function'");
   scenario.onActivity(activity->activity.onActivityResult(103,Activity.RESULT_OK,new Intent().setData(uri)));
   waitFor(scenario,"document.querySelector('#error-announcement').textContent.includes('tekrar')");
   assertArrayEquals(original,bytes(uri));
  } finally { context.getContentResolver().delete(uri,null,null); }
 }
}
