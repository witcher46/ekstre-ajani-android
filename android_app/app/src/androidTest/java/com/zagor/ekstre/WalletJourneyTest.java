package com.zagor.ekstre;

import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.*;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.*;
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class WalletJourneyTest {
 private final UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
 private WebView web(MainActivity a){return (WebView)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);}
 private String js(ActivityScenario<MainActivity> a,String code)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();a.onActivity(activity->web(activity).evaluateJavascript(code,r->{value.set(r);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();}
 private void waitJs(ActivityScenario<MainActivity> a,String condition)throws Exception{String last="";for(int i=0;i<60;i++){last=js(a,condition);if("true".equals(last))return;Thread.sleep(200);}fail("WebView condition failed: "+condition+" returned "+last);}
 private void click(ActivityScenario<MainActivity> a,String selector)throws Exception{js(a,"document.querySelector("+JSONObject.quote(selector)+").click()");}
 private void value(ActivityScenario<MainActivity> a,String name,String value)throws Exception{js(a,"(()=>{const e=document.querySelector('[name="+name+"]');e.value="+JSONObject.quote(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");}
 private void submit(ActivityScenario<MainActivity> a)throws Exception{js(a,"document.getElementById('form').requestSubmit()");waitJs(a,"!document.querySelector('dialog[open]')");}
 private void account(ActivityScenario<MainActivity> a,String name,String type)throws Exception{click(a,"[data-action=addAccount]");value(a,"name",name);value(a,"type",type);value(a,"opening","10000");submit(a);}
 private void transaction(ActivityScenario<MainActivity> a,String kind,int account,int target,String amount,String desc)throws Exception{
  click(a,"nav [data-page=home]");click(a,"[data-action=addTransaction]");value(a,"kind",kind);String aid=js(a,"JSON.parse(Android.load()).accounts["+account+"].id");value(a,"account",new JSONArray("["+aid+"]").getString(0));
  if(target>=0){String tid=js(a,"JSON.parse(Android.load()).accounts["+target+"].id");value(a,"target",new JSONArray("["+tid+"]").getString(0));}
  value(a,"desc",desc);value(a,"amount",amount);value(a,"date","2026-10-04");submit(a);
 }
 private Uri document(String name,String mime,byte[] bytes)throws Exception{Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ContentValues v=new ContentValues();v.put(MediaStore.MediaColumns.DISPLAY_NAME,name);v.put(MediaStore.MediaColumns.MIME_TYPE,mime);v.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS);Uri uri=c.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);assertNotNull(uri);try(OutputStream out=c.getContentResolver().openOutputStream(uri)){out.write(bytes);}return uri;}
 @Before public void emptyTestApp(){InstrumentationRegistry.getInstrumentation().getTargetContext().deleteDatabase("wallet.db");}
 @Test public void previousApkIsPreservedAndCaptured()throws Exception{
  device.executeShellCommand("am start -W -n com.zagor.ekstre.preview/com.zagor.ekstre.MainActivity");
  assertTrue(device.wait(Until.hasObject(By.textContains("Parana genel")),15000));
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File dir=new File(context.getExternalFilesDir(null),"screens");dir.mkdirs();
  device.takeScreenshot(new File(dir,"previous-apk-home.png"));
  assertTrue(device.executeShellCommand("pm list packages com.zagor.ekstre.preview").contains("com.zagor.ekstre.preview"));
 }
 @Test public void allWalletFlowsUseRealWebViewAndNativeStorage()throws Exception{
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");account(a,"Sentetik banka","bank");click(a,"nav [data-page=wallet]");account(a,"Sentetik nakit","cash");account(a,"Sentetik kart A","card");account(a,"Sentetik kart B","card");
   transaction(a,"income",0,-1,"30000","Maaş");transaction(a,"expense",0,-1,"1000","Market");transaction(a,"expense",1,-1,"100","Nakit gider");transaction(a,"expense",2,-1,"2000","Kart gideri");transaction(a,"refund",2,-1,"500","Kart iadesi");transaction(a,"payment",0,2,"1500","Kart ödemesi");transaction(a,"transfer",0,1,"300","Transfer");
   assertEquals("7",js(a,"JSON.parse(Android.load()).transactions.length"));a.recreate();waitJs(a,"!!document.querySelector('nav [data-page=home]')");assertEquals("7",js(a,"JSON.parse(Android.load()).transactions.length"));
   click(a,"nav [data-page=plan]");click(a,"[data-action=budget]");value(a,"amount","5000");submit(a);assertEquals("1",js(a,"Object.keys(JSON.parse(Android.load()).budgets).length"));
   click(a,"[data-action=subscription]");value(a,"name","Sentetik abonelik");value(a,"amount","50");value(a,"next","2026-10-15");submit(a);click(a,"[data-pay]");value(a,"paidOn","2026-10-20");submit(a);assertEquals("\"2026-10-20\"",js(a,"JSON.parse(Android.load()).transactions.at(-1).date"));
   click(a,"nav [data-page=home]");click(a,"[data-page=reports]");waitJs(a,"document.body.innerText.includes('Kategori dağılımı')");
   // Verify a real Android file picker can open and cancel, then exercise actual ContentResolver PDF bytes.
   click(a,"nav [data-page=import]");click(a,"[data-action=pdf]");device.waitForIdle();assertTrue(device.getCurrentPackageName().contains("documentsui"));device.pressBack();
   Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();PDFBoxResourceLoader.init(context);byte[] pdfBytes;
   try(PDDocument pdf=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){PDPage p=new PDPage();pdf.addPage(p);try(PDPageContentStream stream=new PDPageContentStream(pdf,p)){stream.beginText();stream.setFont(PDType1Font.HELVETICA,12);stream.setLeading(18);stream.newLineAtOffset(30,700);for(String line:new String[]{"QNB","Hesap Kesim Tarihi: 05/10/2026","04/10/2026 SENTETIK MARKET 123.00"}){stream.showText(line);stream.newLine();}stream.endText();}pdf.save(out);pdfBytes=out.toByteArray();}
   Uri uri=document("ekstre-synthetic.pdf","application/pdf",pdfBytes);
   try{for(int i=0;i<2;i++){a.onActivity(activity->activity.onActivityResult(101,Activity.RESULT_OK,new Intent().setData(uri)));waitJs(a,"!!document.querySelector('#import-account')");String card=js(a,"JSON.parse(Android.load()).accounts[3].id");js(a,"document.getElementById('import-account').value="+card);click(a,"[data-action=confirmImport]");}assertEquals("9",js(a,"JSON.parse(Android.load()).transactions.length"));}finally{context.getContentResolver().delete(uri,null,null);}
   // CSV still passes through its actual file-input change handler, using a synthetic File.
   js(a,"(()=>{const input=document.getElementById('csv-file'),dt=new DataTransfer();dt.items.add(new File(['bank,kart,period,date,desc,amount_cents,category,tur\\nQNB,Kart,2026-10,2026-10-05,SENTETIK CSV,8000,Market,harcama'],'synthetic.csv',{type:'text/csv'}));input.files=dt.files;input.dispatchEvent(new Event('change'));})()");waitJs(a,"!!document.querySelector('[name=card-0]')");submit(a);assertEquals("10",js(a,"JSON.parse(Android.load()).transactions.length"));
   // Native restore is atomic and retains the previous JSON; UI restore is separately tested in Chrome.
   AtomicReference<MainActivity.Bridge> bridge=new AtomicReference<>();a.onActivity(activity->bridge.set(activity.new Bridge()));String backup=bridge.get().load();JSONObject changed=new JSONObject(backup);changed.put("syntheticExtra","keep recovery");assertTrue(bridge.get().save(changed.toString()));assertTrue(bridge.get().restore(backup));assertTrue(new JSONObject(bridge.get().recovery()).has("syntheticExtra"));assertEquals(10,new JSONObject(bridge.get().load()).getJSONArray("transactions").length());
   a.recreate();waitJs(a,"!!document.querySelector('[data-action=addTransaction]')");assertEquals("10",js(a,"JSON.parse(Android.load()).transactions.length"));
  }
 }
 @Test public void keyboardBackFontScaleAndScreenshots()throws Exception{
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");click(a,"[data-action=demo]");click(a,"[data-action=addTransaction]");
   UiObject input=device.findObject(new UiSelector().className("android.widget.EditText").instance(0));assertTrue(input.waitForExists(5000));input.click();device.waitForIdle();
   AtomicBoolean keyboard=new AtomicBoolean(false);for(int i=0;i<20;i++){a.onActivity(activity->keyboard.set(web(activity).getRootWindowInsets().isVisible(WindowInsets.Type.ime())));if(keyboard.get())break;Thread.sleep(200);}assertTrue("Software keyboard opens",keyboard.get());device.pressBack();device.pressBack();waitJs(a,"!document.querySelector('dialog[open]')");
   Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File dir=new File(context.getExternalFilesDir(null),"screens");dir.mkdirs();
   try{device.executeShellCommand("settings put system font_scale 1.5");a.recreate();waitJs(a,"!!document.querySelector('nav')");AtomicInteger zoom=new AtomicInteger();a.onActivity(activity->zoom.set(web(activity).getSettings().getTextZoom()));assertEquals(150,zoom.get());
    for(int width:new int[]{320,360,390,412}){device.executeShellCommand("wm size "+width+"x844");device.executeShellCommand("wm density 160");device.waitForIdle();a.recreate();waitJs(a,"!!document.querySelector('[data-action=addTransaction]')");assertEquals("true",js(a,"document.documentElement.scrollWidth<=innerWidth"));device.takeScreenshot(new File(dir,"android-home-"+width+"-150.png"));}
   }finally{device.executeShellCommand("settings put system font_scale 1.0");device.executeShellCommand("wm size reset");device.executeShellCommand("wm density reset");}
  }
 }
}
