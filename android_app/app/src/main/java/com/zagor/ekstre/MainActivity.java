package com.zagor.ekstre;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private WebView web;
 private SQLiteDatabase db;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private ValueCallback<Uri[]> chooser;
 private byte[] pendingExport;
 private String pdfPickerRequest;
 private int textZoom=100;
 private static final int PDF=101,FILE=102,EXPORT=103;
 private static final String HOME="https://appassets.androidplatform.net/assets/index.html";
 private static final int BACKUP_LIMIT=32000000;
 private static final int REMINDER_PERMISSION=104;
 private final java.util.concurrent.atomic.AtomicBoolean reminderLaunch=new java.util.concurrent.atomic.AtomicBoolean();
 private final BroadcastReceiver reminderDateReceiver=new BroadcastReceiver(){
  @Override public void onReceive(Context context,Intent intent){refreshReminderUi();}
 };
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  if(Build.VERSION.SDK_INT>=33)setRecentsScreenshotEnabled(false);
  else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
  getWindow().setStatusBarColor(0xff11181e);getWindow().setNavigationBarColor(0xff11181e);
  db=openOrCreateDatabase("wallet.db",MODE_PRIVATE,null);
  db.execSQL("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)");
  reminderLaunch.set(ReminderScheduler.OPEN_ACTION.equals(getIntent().getAction()));
  PDFBoxResourceLoader.init(getApplicationContext());
  getWindow().getDecorView().setBackgroundColor(0xff11181e);
  web=new WebView(this);web.setBackgroundColor(0xff11181e);setContentView(web);
  web.setOnApplyWindowInsetsListener((v,insets)->{
   int left=insets.getSystemWindowInsetLeft(),top=insets.getSystemWindowInsetTop(),right=insets.getSystemWindowInsetRight(),bottom=insets.getStableInsetBottom();
   if(Build.VERSION.SDK_INT>=30){android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;
    if(Build.VERSION.SDK_INT>=35)bottom=Math.max(bottom,insets.getInsets(WindowInsets.Type.ime()).bottom);
   }
   ViewGroup.MarginLayoutParams p=(ViewGroup.MarginLayoutParams)v.getLayoutParams();
   if(p.leftMargin!=left||p.topMargin!=top||p.rightMargin!=right||p.bottomMargin!=bottom){p.setMargins(left,top,right,bottom);v.setLayoutParams(p);}return insets;
  });
  textZoom=Math.round(getResources().getConfiguration().fontScale*100);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setTextZoom(textZoom);
  WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){
    WebResourceResponse found=assets.shouldInterceptRequest(request.getUrl());
    if(found!=null&&request.getUrl().getPath().endsWith(".mjs"))found.setMimeType("text/javascript");
    return found!=null?found:new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
   }
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !r.getUrl().toString().equals(HOME);}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){if(chooser!=null)chooser.onReceiveValue(null);chooser=cb;try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");startActivityForResult(intent,FILE);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;}return true;}
   @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Onayla",(d,w)->result.confirm()).setNegativeButton("Vazgeç",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
  });
  web.addJavascriptInterface(new Bridge(),"Android");web.loadUrl(HOME);
 }
 private void callback(String fn,String value){callback(fn,value,null);}
 private void callback(String fn,String value,String request){
  String args=JSONObject.quote(value)+(request==null?"":","+JSONObject.quote(request));
  runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())web.evaluateJavascript("window."+fn+"("+args+")",null);});
 }
 private String readSlot(int id){
  String key=String.valueOf(id);
  int length;
  // Byte chunks preserve even a damaged value containing NUL. Decode UTF-8 only
  // after joining them so a character spanning two CursorWindows stays intact.
  try(Cursor row=db.rawQuery("SELECT length(CAST(content AS BLOB)) FROM snapshots WHERE id=?",new String[]{key})){
   if(!row.moveToFirst())return null;
   length=row.getInt(0);
  }
  byte[] content=new byte[length];
  for(int offset=0;offset<length;offset+=100000){
   try(Cursor row=db.rawQuery("SELECT substr(CAST(content AS BLOB),?,100000) FROM snapshots WHERE id=?",new String[]{String.valueOf(offset+1),key})){
    if(!row.moveToFirst())throw new IllegalStateException("Snapshot changed during read");
    byte[] chunk=row.getBlob(0);
    if(chunk.length!=Math.min(100000,length-offset))throw new IllegalStateException("Snapshot changed during read");
    System.arraycopy(chunk,0,content,offset,chunk.length);
   }
  }
  String decoded=new String(content,StandardCharsets.UTF_8);
  // Reject lossy decoding while keeping an exact token for a damaged primary.
  // The NUL prefix makes the value unreadable as JSON and reserves a distinct range.
  if(decoded.indexOf('\uFFFD')>=0&&!Arrays.equals(content,decoded.getBytes(StandardCharsets.UTF_8)))
   return "\0"+android.util.Base64.encodeToString(content,android.util.Base64.NO_WRAP);
  return decoded.startsWith("\0")?"\0"+decoded:decoded;
 }
 private String readSnapshot(int id){
  String value=readSlot(id);
  return value==null?"":value;
 }
 private boolean supportsSnapshot(JSONObject wallet)throws JSONException{
  if(!"ekstre-android".equals(wallet.opt("format"))||!(wallet.opt("version") instanceof Number))return false;
  double version=wallet.getDouble("version");
  if(version!=1&&version!=2&&version!=3&&version!=4&&version!=5)return false;
  for(String name:new String[]{"accounts","transactions","statements","subscriptions","categories"})wallet.getJSONArray(name);
  wallet.getJSONObject("budgets");
  if(!hasDistinctIds(wallet.getJSONArray("statements"))||!hasDistinctIds(wallet.getJSONArray("subscriptions")))return false;
  if(!validTransactionTargets(wallet.getJSONArray("accounts"),wallet.getJSONArray("transactions")))return false;
  if(version==1)return true;
  return validBalanceObservations(wallet)&&(version<3 ||
   BalanceApprovalStorage.validApprovals(wallet.getJSONObject("balanceReconciliation").getJSONArray("approvals")))&&
   (version<4||ExpenseAllocationStorage.validSnapshot(wallet))&&
   (version<5||SavingsGoalStorage.validSnapshot(wallet));
 }
 private boolean hasDistinctIds(JSONArray rows)throws JSONException{
  if(rows.length()>50000)return false;
  HashSet<String> ids=new HashSet<>();
  for(int i=0;i<rows.length();i++){
   if(!(rows.getJSONObject(i).opt("id") instanceof String id)||!ids.add(id))return false;
  }
  return true;
 }
 private boolean validTransactionTargets(JSONArray accounts,JSONArray transactions)throws JSONException{
  if(transactions.length()>50000)return false;
  HashMap<String,String> types=new HashMap<>();
  for(int i=0;i<accounts.length();i++){
   JSONObject account=accounts.getJSONObject(i);
   types.put(account.getString("id"),account.getString("type"));
  }
  for(int i=0;i<transactions.length();i++){
   JSONObject row=transactions.getJSONObject(i);
   String kind=row.optString("kind");
   if(!"payment".equals(kind)&&!"transfer".equals(kind)){
    // Match the ledger's exact string lookup, without coercing legacy metadata.
    if(row.opt("target") instanceof String targetId&&types.containsKey(targetId))return false;
    continue;
   }
   if(!(row.opt("account") instanceof String from)||!(row.opt("target") instanceof String to)||from.equals(to))return false;
   String source=types.get(from),target=types.get(to);
   if(!"bank".equals(source)&&!"cash".equals(source))return false;
   if("payment".equals(kind)?!"card".equals(target):(!"bank".equals(target)&&!"cash".equals(target)))return false;
  }
  return true;
 }
 private boolean validBalanceObservations(JSONObject wallet)throws JSONException{
  JSONArray accounts=wallet.getJSONArray("accounts");
  JSONArray observations=wallet.getJSONObject("balanceReconciliation").getJSONArray("observations");
  if(accounts.length()>50000||observations.length()>50000)return false;
  HashMap<String,String> types=new HashMap<>();
  for(int i=0;i<accounts.length();i++){
   JSONObject account=accounts.getJSONObject(i);
   if(!(account.opt("id") instanceof String id)||id.length()>200||
     !(account.opt("type") instanceof String type)||
     !("bank".equals(type)||"cash".equals(type)||"card".equals(type))||
     !(account.opt("name") instanceof String name)||name.length()>200||
     name.matches("[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]*")||
     !(account.opt("opening") instanceof Number opening))return false;
   double cents=opening.doubleValue();
   if(Math.abs(cents)>1e12||cents!=Math.rint(cents)||types.putIfAbsent(id,type)!=null)return false;
  }
  HashSet<String> ids=new HashSet<>();
  var timestampFormat=new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
  for(int i=0;i<observations.length();i++){
   JSONObject row=observations.getJSONObject(i);
   if(!(row.opt("id") instanceof String id)||!id.matches("[A-Za-z0-9_-]{1,200}")||!ids.add(id))return false;
   if(!(row.opt("accountId") instanceof String accountId))return false;
   Object source=row.opt("sourceKind");
   String type=types.get(accountId);
   boolean validSource="bank".equals(type)&&("bankDocument".equals(source)||"manualBank".equals(source))
     ||"cash".equals(type)&&"cashCount".equals(source);
   Object role=row.opt("role");
   if(!validSource||!("anchor".equals(role)||"observation".equals(role)))return false;
   if(!(row.opt("observedAmountCents") instanceof Number amount))return false;
   double cents=amount.doubleValue();
   if(Math.abs(cents)>9007199254740991d||cents!=Math.rint(cents))return false;
   if(row.has("note")&&(!(row.opt("note") instanceof String note)||note.length()>2000))return false;
   if(!(row.opt("observedDate") instanceof String date)||date.length()!=10||
     !LocalDate.parse(date).toString().equals(date))return false;
   if(!(row.opt("createdAt") instanceof String created)||!(row.opt("updatedAt") instanceof String updated)||
     created.length()!=24||updated.length()!=24||updated.compareTo(created)<0||
     !timestampFormat.format(Instant.parse(created)).equals(created)||
     !timestampFormat.format(Instant.parse(updated)).equals(updated))return false;
  }
  return true;
 }
 private boolean isJsonDocument(String content)throws IOException{
  // JSONObject accepts a permissive prefix. Snapshots must be readable by JSON.parse.
  if(content.startsWith("\uFEFF"))return false;
  // Gson's skipValue does not check raw control characters in quoted strings.
  boolean quoted=false;
  for(int i=0;i<content.length();i++){
   char c=content.charAt(i);
   if(quoted&&c<' ')return false;
   if(quoted&&c=='\\'){
    if(++i>=content.length()||content.charAt(i)<' ')return false;
   }else if(c=='"')quoted=!quoted;
  }
  try(JsonReader reader=new JsonReader(new StringReader(content))){
   reader.setStrictness(Strictness.STRICT);
   // The existing JSONObject parser already read this document. Keep its depth
   // behavior for unknown legacy fields instead of imposing Gson's lower default.
   reader.setNestingLimit(Integer.MAX_VALUE);
   if(reader.peek()!=JsonToken.BEGIN_OBJECT)return false;
   reader.skipValue();
   return reader.peek()==JsonToken.END_DOCUMENT;
  }
 }
 private synchronized String readForCompare() {
  try {
   db.beginTransactionNonExclusive();
   try {
    String content = readSnapshot(1);
    String result = BalanceApprovalStorage.sha256(content)+"\n"+content;
    db.setTransactionSuccessful();
    return result;
   } finally {
    db.endTransaction();
   }
  } catch (Exception e) {
   return null;
  }
 }
 private static String slotToken(String raw){
  return raw==null?"":BalanceApprovalStorage.sha256(raw);
 }
 private boolean supportedDocument(String raw)throws Exception {
  return raw!=null&&raw.getBytes(StandardCharsets.UTF_8).length<=BACKUP_LIMIT&&
    isJsonDocument(raw)&&supportsSnapshot(new JSONObject(raw));
 }
 private void copySlot(int from,int to){
  db.execSQL("INSERT OR REPLACE INTO snapshots SELECT ?,content FROM snapshots WHERE id=?",new Object[]{to,from});
 }
 private synchronized boolean writeSnapshot(String content,String expectedToken,boolean mayAppendApproval){
  try{
   if(!supportedDocument(content))return false;
   JSONObject candidate=new JSONObject(content);
   db.beginTransaction();
   try{
    String current=readSlot(1);
    String currentToken=mayAppendApproval&&current==null?BalanceApprovalStorage.sha256(""):slotToken(current);
    if(!expectedToken.equals(currentToken)||
       (mayAppendApproval&&expectedToken.equals(BalanceApprovalStorage.sha256(content))))return false;
    JSONObject before=current==null?null:new JSONObject(current);
    if(!BalanceApprovalStorage.preservesHistory(before,candidate,mayAppendApproval)||
       !ExpenseAllocationStorage.validWrite(before,candidate,mayAppendApproval)||
       !SavingsGoalStorage.validWrite(before,candidate,mayAppendApproval))return false;
    copySlot(1,2);
    db.execSQL("INSERT OR REPLACE INTO snapshots(id,content) VALUES(1,?)",new Object[]{content});
    db.setTransactionSuccessful();
   }finally{db.endTransaction();}
   return true;
  }catch(Exception|StackOverflowError e){return false;}
 }
 // JS validates the domain model before consent. Bind that exact selection and
 // the displaced primary to the SQLite write lock; never rotate unchecked bytes.
 private synchronized boolean replaceReviewed(String currentToken,int slot,String sourceToken,
                                             String external,boolean keepCurrent){
  boolean recovering=external==null;
  if(slot<0||slot>3||(recovering&&slot<2))return false;
  try{
   if(!recovering&&!supportedDocument(external))return false;
   db.beginTransaction();
   try{
    String current=readSlot(1);
    if(!slotToken(current).equals(currentToken))return false;
    String source=slot==0?null:slot==1?current:readSlot(slot);
    if(!slotToken(source).equals(sourceToken)||(slot!=0&&!supportedDocument(source)))return false;
    if(recovering){
     if(keepCurrent){
      if(!supportedDocument(current))return false;
      copySlot(1,slot==3?2:3);
     }
     copySlot(slot,1);
    }else{
     if(slot==1){copySlot(1,3);copySlot(1,2);}
     else if(slot==2){copySlot(2,3);}
     db.execSQL("INSERT OR REPLACE INTO snapshots(id,content) VALUES(1,?)",new Object[]{external});
    }
    db.setTransactionSuccessful();
   }finally{db.endTransaction();}
   return true;
  }catch(Exception|StackOverflowError e){return false;}
 }
 public class Bridge {
  @JavascriptInterface public String reminderSnoozes(){return ReminderScheduler.snoozes(db);}
  @JavascriptInterface public String reminderStatus(){
   if(!ReminderScheduler.enabled(db))return "off";
   return ReminderScheduler.canNotify(MainActivity.this)?"on":"blocked";
  }
  @JavascriptInterface public boolean replaceReminderSchedule(String token,String before,String next,String plan){
   synchronized(ReminderScheduler.LOCK){
    try {
     db.beginTransaction();
     try {
      if(!slotToken(readSlot(1)).equals(token)||!ReminderScheduler.replacePlan(db,before,next,plan))return false;
      db.setTransactionSuccessful();
     }finally{db.endTransaction();}
    }catch(JSONException|RuntimeException e){return false;}
    try {
     if(!before.equals(next))ReminderScheduler.cancel(MainActivity.this,true);
     ReminderScheduler.arm(MainActivity.this,db);
    }catch(RuntimeException e){android.util.Log.w("Reminders","Could not arm reminder alarm");}
    return true;
   }
  }
  @JavascriptInterface public void setRemindersEnabled(boolean enabled){
   synchronized(ReminderScheduler.LOCK){ReminderScheduler.setEnabled(MainActivity.this,db,enabled);}
   runOnUiThread(()->{
    if(isFinishing()||isDestroyed())return;
    if(enabled&&Build.VERSION.SDK_INT>=33&&!ReminderScheduler.permissionGranted(MainActivity.this)){
     requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},REMINDER_PERMISSION);
    }
    refreshReminderUi();
   });
  }
  @JavascriptInterface public void openReminderSettings(){
   runOnUiThread(()->startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName())));
  }
  @JavascriptInterface public boolean takeReminderLaunch(){return reminderLaunch.getAndSet(false);}
  @JavascriptInterface public int textZoom(){return textZoom;}
  @JavascriptInterface public String versionName(){
   try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}
   catch(PackageManager.NameNotFoundException e){return null;}
  }
  @JavascriptInterface public String load(){synchronized(MainActivity.this){return readSnapshot(1);}}
  @JavascriptInterface public String loadForCompare(){return readForCompare();}
  @JavascriptInterface public boolean saveIfUnchanged(String token,String content){
   return token!=null&&token.matches("[a-f0-9]{64}")&&ReminderScheduler.walletWrite(MainActivity.this,()->writeSnapshot(content,token,true));
  }
  @JavascriptInterface public String snapshotSlot(int slot){
   if(slot<1||slot>3)throw new IllegalArgumentException("Invalid snapshot slot");
   synchronized(MainActivity.this){
    db.beginTransactionNonExclusive();
    try{String raw=readSlot(slot);db.setTransactionSuccessful();return raw;}
    finally{db.endTransaction();}
   }
  }
  @JavascriptInterface public boolean recoverSnapshot(int slot,String source,String current,boolean keepCurrent){
   return ReminderScheduler.walletWrite(MainActivity.this,()->replaceReviewed(current,slot,source,null,keepCurrent));
  }
  @JavascriptInterface public boolean restoreChecked(String current,int slot,String source,String content){
   return content!=null&&ReminderScheduler.walletWrite(MainActivity.this,()->replaceReviewed(current,slot,source,content,false));
  }
  @JavascriptInterface public String recovery(){synchronized(MainActivity.this){return readSnapshot(3);}}
  @JavascriptInterface public boolean save(String content,String token){
   return token!=null&&(token.isEmpty()||token.matches("[a-f0-9]{64}"))&&ReminderScheduler.walletWrite(MainActivity.this,()->writeSnapshot(content,token,false));
  }
  @JavascriptInterface public void pickPdf(String request){runOnUiThread(()->{
   if(request==null||request.isEmpty())return;
   if(pdfPickerRequest!=null){callback("onPdfError","PDF dosya seçici zaten açık.",request);return;}
   pdfPickerRequest=request;
   try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf"),PDF);}
   catch(Exception e){pdfPickerRequest=null;callback("onPdfError","Dosya seçici açılamadı.",request);}
  });}
  @JavascriptInterface public void exportBackup(String content){
   byte[] bytes=content==null?null:content.getBytes(StandardCharsets.UTF_8);
   if(bytes!=null&&bytes.length>BACKUP_LIMIT){
    callback("nativeError","Yedek 32 MB sınırını aşıyor. Mevcut kayıtlar korunuyor.");
    return;
   }
   try{
    if(bytes==null||!isJsonDocument(content)||!supportsSnapshot(new JSONObject(content)))
     throw new IOException();
   }catch(Exception|StackOverflowError e){
    callback("nativeError","Yedek hazırlanamadı. Dışa aktarmayı tekrar başlat.");
    return;
   }
   runOnUiThread(()->{
    if(pendingExport!=null){callback("nativeError","Yedek dosya seçici zaten açık.");return;}
    pendingExport=bytes;
    try{
     startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
       .setType("application/json").putExtra(Intent.EXTRA_TITLE,"ekstre-ajani-yedek.json"),EXPORT);
    }catch(Exception e){
     pendingExport=null;
     callback("nativeError","Yedek dosyası oluşturulamadı. Dışa aktarmayı tekrar başlat.");
    }
   });
  }
 }
 @Override protected void onActivityResult(int req,int result,Intent data){
  super.onActivityResult(req,result,data);Uri uri=data==null?null:data.getData();
  if(req==FILE){if(chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&uri!=null?new Uri[]{uri}:null);chooser=null;}return;}
  if(req==PDF){
   String request=pdfPickerRequest;
   pdfPickerRequest=null;
   if(request==null)return;
   if(result!=RESULT_OK||uri==null){callback("onPdfError","PDF seçimi iptal edildi.",request);return;}
   readPdf(uri,request);
   return;
  }
  if(req==EXPORT){
   byte[] saved=pendingExport;
   pendingExport=null;
   if(result!=RESULT_OK||uri==null)return;
   if(saved==null){
    String message="Yedek kaydedilemedi. Dışa aktarmayı tekrar başlat.";
    // Android may deliver this result before the recreated WebView has loaded.
    web.evaluateJavascript("typeof window.nativeError==='function' && (window.nativeError("
      +JSONObject.quote(message)+"),true)",delivered->{
      if(!"true".equals(delivered))
       android.widget.Toast.makeText(this,message,android.widget.Toast.LENGTH_LONG).show();
     });
    return;
   }
   worker.execute(()->{
    try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
     if(out==null)throw new IOException();
     out.write(saved);
    }catch(Exception e){
     callback("nativeError","Yedek kaydedilemedi. Dışa aktarmayı tekrar başlat.");
     return;
    }
    callback("nativeNotice","Yedek kaydedildi.");
   });
  }
 }
 private void readPdf(Uri uri,String request){
  worker.execute(()->{
   try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
    if(in==null)throw new IOException();byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>20*1024*1024)throw new IOException("PDF en fazla 20 MB olabilir.");bytes.write(buf,0,n);}
    try(PDDocument pdf=PDDocument.load(bytes.toByteArray())){if(pdf.getNumberOfPages()>100)throw new IOException("PDF en fazla 100 sayfa olabilir.");PDFTextStripper stripper=new PDFTextStripper();stripper.setSortByPosition(true);String text=stripper.getText(pdf);if(text.trim().isEmpty())throw new IOException("PDF metin içermiyor. Taranmış belgeler desteklenmiyor.");if(text.length()>3_000_000)throw new IOException("PDF metni çok büyük.");callback("onPdfText",text,request);}
   }catch(Exception e){callback("onPdfError","PDF okunamadı. Şifresiz, metin içeren banka PDF’i seç. "+(e instanceof IOException?e.getMessage():""),request);}
  });
 }

 private void refreshReminderUi(){
  if(web!=null)web.evaluateJavascript("window.onRemindersChanged?.()",null);
 }
 @Override protected void onStart(){
  super.onStart();
  IntentFilter dates=new IntentFilter(Intent.ACTION_DATE_CHANGED);
  dates.addAction(Intent.ACTION_TIME_CHANGED);
  dates.addAction(Intent.ACTION_TIMEZONE_CHANGED);
  if(Build.VERSION.SDK_INT>=33)registerReceiver(reminderDateReceiver,dates,Context.RECEIVER_NOT_EXPORTED);
  else registerReceiver(reminderDateReceiver,dates);
 }
 @Override protected void onResume(){super.onResume();refreshReminderUi();}
 @Override protected void onStop(){unregisterReceiver(reminderDateReceiver);super.onStop();}
 @Override protected void onNewIntent(Intent intent){
  super.onNewIntent(intent);
  if(ReminderScheduler.OPEN_ACTION.equals(intent.getAction())){
   reminderLaunch.set(true);
   web.evaluateJavascript("if(typeof window.showReminders==='function'&&Android.takeReminderLaunch()===true)window.showReminders()",null);
  }
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){
  super.onRequestPermissionsResult(request,permissions,results);
  if(request==REMINDER_PERMISSION)refreshReminderUi();
 }
 @Override protected void onPause(){
  if(web!=null)web.evaluateJavascript("window.hideBalanceApprovalDetails?.()",null);
  super.onPause();
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.handleBack && window.handleBack()",result->{if(!"true".equals(result))super.onBackPressed();});}
 @Override protected void onDestroy(){worker.shutdown();if(chooser!=null)chooser.onReceiveValue(null);web.removeJavascriptInterface("Android");web.destroy();super.onDestroy();}
}
