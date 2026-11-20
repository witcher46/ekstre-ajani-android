package com.zagor.ekstre;

import android.app.*;
import android.os.*;
import android.content.*;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private WebView web;
 private SQLiteDatabase db;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private ValueCallback<Uri[]> chooser;
 private String exportText;
 private String pdfPickerRequest;
 private int textZoom=100;
 private static final int PDF=101,FILE=102,EXPORT=103;
 private static final String HOME="https://appassets.androidplatform.net/assets/index.html";
 private static final int BACKUP_LIMIT=32000000;
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  if(Build.VERSION.SDK_INT>=33)setRecentsScreenshotEnabled(false);
  else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
  getWindow().setStatusBarColor(0xff11181e);getWindow().setNavigationBarColor(0xff11181e);
  db=openOrCreateDatabase("wallet.db",MODE_PRIVATE,null);
  db.execSQL("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)");
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
 private String readSnapshot(int id){
  int length;try(Cursor c=db.rawQuery("SELECT length(content) FROM snapshots WHERE id=?",new String[]{String.valueOf(id)})){if(!c.moveToFirst())return "";length=c.getInt(0);}
  StringBuilder content=new StringBuilder(length);
  // Small SQL chunks avoid the CursorWindow limit for valid large JSON backups.
  for(int start=1;start<=length;start+=100000){try(Cursor c=db.rawQuery("SELECT substr(content,?,100000) FROM snapshots WHERE id=?",new String[]{String.valueOf(start),String.valueOf(id)})){if(c.moveToFirst())content.append(c.getString(0));}}
  return content.toString();
 }
 private boolean supportsSnapshot(JSONObject wallet)throws JSONException{
  if(!"ekstre-android".equals(wallet.opt("format"))||!(wallet.opt("version") instanceof Number))return false;
  double version=wallet.getDouble("version");
  if(version!=1&&version!=2&&version!=3)return false;
  for(String name:new String[]{"accounts","transactions","statements","subscriptions","categories"})wallet.getJSONArray(name);
  wallet.getJSONObject("budgets");
  if(version==1)return true;
  for(String name:new String[]{"transactions","statements","subscriptions"}){
   JSONArray rows=wallet.getJSONArray(name);
   if(rows.length()>50000)return false;
   for(int i=0;i<rows.length();i++)rows.getJSONObject(i);
  }
  return validBalanceObservations(wallet)&& (version!=3 ||
   BalanceApprovalStorage.validApprovals(wallet.getJSONObject("balanceReconciliation").getJSONArray("approvals")));
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
 private synchronized boolean writeSnapshot(String content, boolean restore, String expectedToken, String recoveryToken) {
  if(content==null||content.getBytes(StandardCharsets.UTF_8).length>BACKUP_LIMIT)return false;
  try {
   JSONObject candidate = new JSONObject(content);
   if(!supportsSnapshot(candidate)||!isJsonDocument(content))return false;
   db.beginTransaction();
   try {
    if(recoveryToken!=null) {
     String recovery = readSnapshot(3);
     if(recovery.isEmpty()||!recoveryToken.equals(BalanceApprovalStorage.sha256(recovery))||
        !BalanceApprovalStorage.preservesHistory(new JSONObject(recovery),candidate,false))return false;
    } else if(!restore) {
     String current = readSnapshot(1);
     if(expectedToken!=null &&
        (!expectedToken.equals(BalanceApprovalStorage.sha256(current)) ||
         expectedToken.equals(BalanceApprovalStorage.sha256(content))))return false;
     if(!BalanceApprovalStorage.preservesHistory(current.isEmpty()?null:new JSONObject(current),candidate,expectedToken!=null))return false;
    }
    if(restore)db.execSQL("INSERT OR REPLACE INTO snapshots SELECT 3,content FROM snapshots WHERE id=1");
    db.execSQL("INSERT OR REPLACE INTO snapshots SELECT 2,content FROM snapshots WHERE id=1");
    db.execSQL("INSERT OR REPLACE INTO snapshots(id,content) VALUES(1,?)",new Object[]{content});
    db.setTransactionSuccessful();
   } finally {
    db.endTransaction();
   }
   return true;
  } catch(Exception|StackOverflowError e) {
   return false;
  }
 } public class Bridge {
  @JavascriptInterface public int textZoom(){return textZoom;}
  @JavascriptInterface public String load(){synchronized(MainActivity.this){return readSnapshot(1);}}
  @JavascriptInterface public String loadForCompare(){return readForCompare();}
  @JavascriptInterface public boolean saveIfUnchanged(String token,String content){
   return token!=null&&token.matches("[a-f0-9]{64}")&&writeSnapshot(content,false,token,null);
  }
  @JavascriptInterface public boolean recoverSaved(String token,String content){
   return token!=null&&token.matches("[a-f0-9]{64}")&&writeSnapshot(content,false,null,token);
  }  @JavascriptInterface public String recovery(){synchronized(MainActivity.this){return readSnapshot(3);}}
  @JavascriptInterface public boolean save(String content){return writeSnapshot(content,false,null,null);}
  @JavascriptInterface public boolean restore(String content){return writeSnapshot(content,true,null,null);}
  @JavascriptInterface public void pickPdf(String request){runOnUiThread(()->{
   if(request==null||request.isEmpty())return;
   if(pdfPickerRequest!=null){callback("onPdfError","PDF dosya seçici zaten açık.",request);return;}
   pdfPickerRequest=request;
   try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf"),PDF);}
   catch(Exception e){pdfPickerRequest=null;callback("onPdfError","Dosya seçici açılamadı.",request);}
  });}
  @JavascriptInterface public void exportBackup(String content){if(content==null||content.getBytes(StandardCharsets.UTF_8).length>BACKUP_LIMIT){callback("nativeError","Yedek 32 MB sınırını aşıyor; mevcut kayıtlar korunuyor.");return;}runOnUiThread(()->{exportText=content;try{startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"ekstre-ajani-yedek.json"),EXPORT);}catch(Exception e){exportText=null;callback("nativeError","Yedek dosyası oluşturulamadı.");}});}
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
  if(result!=RESULT_OK||uri==null){if(req==EXPORT)exportText=null;return;}
  if(req==EXPORT){final String saved=exportText;exportText=null;worker.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null||saved==null)throw new IOException();out.write(saved.getBytes(StandardCharsets.UTF_8));callback("nativeNotice","Yedek kaydedildi.");}catch(Exception e){callback("nativeError","Yedek kaydedilemedi.");}});return;}
 }
 private void readPdf(Uri uri,String request){
  worker.execute(()->{
   try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
    if(in==null)throw new IOException();byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>20*1024*1024)throw new IOException("PDF en fazla 20 MB olabilir.");bytes.write(buf,0,n);}
    try(PDDocument pdf=PDDocument.load(bytes.toByteArray())){if(pdf.getNumberOfPages()>100)throw new IOException("PDF en fazla 100 sayfa olabilir.");PDFTextStripper stripper=new PDFTextStripper();stripper.setSortByPosition(true);String text=stripper.getText(pdf);if(text.trim().isEmpty())throw new IOException("PDF metin içermiyor. Taranmış belgeler desteklenmiyor.");if(text.length()>3_000_000)throw new IOException("PDF metni çok büyük.");callback("onPdfText",text,request);}
   }catch(Exception e){callback("onPdfError","PDF okunamadı. Şifresiz, metin içeren banka PDF’i seç. "+(e instanceof IOException?e.getMessage():""),request);}
  });
 }
 @Override protected void onPause(){
  if(web!=null)web.evaluateJavascript("window.hideBalanceApprovalDetails?.()",null);
  super.onPause();
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.handleBack && window.handleBack()",result->{if(!"true".equals(result))super.onBackPressed();});}
 @Override protected void onDestroy(){worker.shutdown();if(chooser!=null)chooser.onReceiveValue(null);web.removeJavascriptInterface("Android");web.destroy();super.onDestroy();}
}
