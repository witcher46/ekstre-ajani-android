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
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private WebView web;
 private SQLiteDatabase db;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private ValueCallback<Uri[]> chooser;
 private String exportText;
 private static final int PDF=101,FILE=102,EXPORT=103;
 private static final String HOME="https://appassets.androidplatform.net/assets/index.html";
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  getWindow().setStatusBarColor(0xff11181e);getWindow().setNavigationBarColor(0xff11181e);
  db=openOrCreateDatabase("wallet.db",MODE_PRIVATE,null);
  db.execSQL("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, content TEXT NOT NULL)");
  PDFBoxResourceLoader.init(getApplicationContext());
  web=new WebView(this);setContentView(web);
  web.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setTextZoom(Math.round(getResources().getConfiguration().fontScale*100));
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
 private void callback(String fn,String value){runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())web.evaluateJavascript("window."+fn+"("+JSONObject.quote(value)+")",null);});}
 private String readSnapshot(int id){
  int length;try(Cursor c=db.rawQuery("SELECT length(content) FROM snapshots WHERE id=?",new String[]{String.valueOf(id)})){if(!c.moveToFirst())return "";length=c.getInt(0);}
  StringBuilder content=new StringBuilder(length);
  // Small SQL chunks avoid the CursorWindow limit for valid large JSON backups.
  for(int start=1;start<=length;start+=100000){try(Cursor c=db.rawQuery("SELECT substr(content,?,100000) FROM snapshots WHERE id=?",new String[]{String.valueOf(start),String.valueOf(id)})){if(c.moveToFirst())content.append(c.getString(0));}}
  return content.toString();
 }
 private synchronized boolean writeSnapshot(String content,boolean restore){
  if(content==null||content.length()>8_000_000)return false;
  try{JSONObject v=new JSONObject(content);if(!v.optString("format").equals("ekstre-android")||v.optInt("version")!=1)return false;
   for(String name:new String[]{"accounts","transactions","statements","subscriptions","categories"})v.getJSONArray(name);v.getJSONObject("budgets");
   db.beginTransaction();try{if(restore)db.execSQL("INSERT OR REPLACE INTO snapshots SELECT 3,content FROM snapshots WHERE id=1");db.execSQL("INSERT OR REPLACE INTO snapshots SELECT 2,content FROM snapshots WHERE id=1");db.execSQL("INSERT OR REPLACE INTO snapshots(id,content) VALUES(1,?)",new Object[]{content});db.setTransactionSuccessful();}finally{db.endTransaction();}return true;
  }catch(Exception e){return false;}
 }
 public class Bridge {
  @JavascriptInterface public String load(){synchronized(MainActivity.this){return readSnapshot(1);}}
  @JavascriptInterface public String recovery(){synchronized(MainActivity.this){return readSnapshot(3);}}
  @JavascriptInterface public boolean save(String content){return writeSnapshot(content,false);}
  @JavascriptInterface public boolean restore(String content){return writeSnapshot(content,true);}
  @JavascriptInterface public void pickPdf(){runOnUiThread(()->{try{startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf"),PDF);}catch(Exception e){callback("nativeError","Dosya seçici açılamadı.");}});}
  @JavascriptInterface public void exportBackup(String content){if(content==null||content.length()>8_000_000)return;runOnUiThread(()->{exportText=content;try{startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"ekstre-ajani-yedek.json"),EXPORT);}catch(Exception e){exportText=null;callback("nativeError","Yedek dosyası oluşturulamadı.");}});}
 }
 @Override protected void onActivityResult(int req,int result,Intent data){
  super.onActivityResult(req,result,data);Uri uri=data==null?null:data.getData();
  if(req==FILE){if(chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&uri!=null?new Uri[]{uri}:null);chooser=null;}return;}
  if(result!=RESULT_OK||uri==null){if(req==PDF)callback("nativeError","PDF seçimi iptal edildi.");if(req==EXPORT)exportText=null;return;}
  if(req==EXPORT){final String saved=exportText;exportText=null;worker.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null||saved==null)throw new IOException();out.write(saved.getBytes(StandardCharsets.UTF_8));callback("nativeNotice","Yedek kaydedildi.");}catch(Exception e){callback("nativeError","Yedek kaydedilemedi.");}});return;}
  if(req==PDF)worker.execute(()->{
   try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
    if(in==null)throw new IOException();byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>20*1024*1024)throw new IOException("PDF en fazla 20 MB olabilir.");bytes.write(buf,0,n);}
    try(PDDocument pdf=PDDocument.load(bytes.toByteArray())){if(pdf.getNumberOfPages()>100)throw new IOException("PDF en fazla 100 sayfa olabilir.");PDFTextStripper stripper=new PDFTextStripper();stripper.setSortByPosition(true);String text=stripper.getText(pdf);if(text.trim().isEmpty())throw new IOException("PDF metin içermiyor. Taranmış belgeler desteklenmiyor.");if(text.length()>3_000_000)throw new IOException("PDF metni çok büyük.");callback("onPdfText",text);}
   }catch(Exception e){callback("nativeError","PDF okunamadı. Şifresiz, metin içeren banka PDF’i seç. "+(e instanceof IOException?e.getMessage():""));}
  });
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.handleBack && window.handleBack()",result->{if(!"true".equals(result))super.onBackPressed();});}
 @Override protected void onDestroy(){worker.shutdown();if(chooser!=null)chooser.onReceiveValue(null);web.removeJavascriptInterface("Android");web.destroy();super.onDestroy();}
}
