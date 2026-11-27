package com.zagor.ekstre;

import android.app.Activity;
import android.content.*;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Environment;
import android.os.SystemClock;
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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class WalletJourneyTest {
 private final UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
 private String systemLabels(){StringBuilder s=new StringBuilder();for(UiObject2 e:device.findObjects(By.pkg("android"))){String t=e.getText();if(t!=null)s.append('[').append(t).append(']');}return s.toString();}
 private void evidence(String name)throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File dir=new File(context.getExternalFilesDir(null),"screens");dir.mkdirs();
  device.takeScreenshot(new File(dir,name+".png"));device.dumpWindowHierarchy(new File(dir,name+".xml"));
  try(FileOutputStream out=new FileOutputStream(new File(dir,name+".txt"))){String info="package="+device.getCurrentPackageName()+" screenOn="+device.isScreenOn()+"\n"+device.executeShellCommand("dumpsys window");out.write(info.getBytes(StandardCharsets.UTF_8));}
 }
 private WebView web(MainActivity a){return (WebView)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);}
 private void drawn(ActivityScenario<MainActivity> a)throws Exception{CountDownLatch done=new CountDownLatch(1);a.onActivity(activity->{WebView w=web(activity);w.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long id){w.postOnAnimation(()->w.postOnAnimation(done::countDown));}});});assertTrue("WebView presents the updated frame",done.await(15,TimeUnit.SECONDS));}
 private String js(ActivityScenario<MainActivity> a,String code)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();a.onActivity(activity->web(activity).evaluateJavascript(code,r->{value.set(r);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();}
 private void waitJs(ActivityScenario<MainActivity> a,String condition)throws Exception{String last="";for(int i=0;i<60;i++){last=js(a,condition);if("true".equals(last))return;Thread.sleep(200);}fail("WebView condition failed: "+condition+" returned "+last);}
 private void click(ActivityScenario<MainActivity> a,String selector)throws Exception{js(a,"document.querySelector("+JSONObject.quote(selector)+").click()");}
 private void openRoute(ActivityScenario<MainActivity> a,String route)throws Exception{
  if(route.equals("plan")||route.equals("import")||route.equals("transactions")){
   click(a,"#more");
   click(a,"#modal[open] [data-destination="+route+"]");
  }else click(a,"nav [data-page="+route+"]");
 }
 private void value(ActivityScenario<MainActivity> a,String name,String value)throws Exception{js(a,"(()=>{const e=document.querySelector('[name="+name+"]');e.value="+JSONObject.quote(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");}
 private void submit(ActivityScenario<MainActivity> a)throws Exception{js(a,"document.getElementById('form').requestSubmit()");waitJs(a,"!document.querySelector('dialog[open]')");}
 private void account(ActivityScenario<MainActivity> a,String name,String type)throws Exception{account(a,name,type,"10000");}
 private void account(ActivityScenario<MainActivity> a,String name,String type,String opening)throws Exception{click(a,"[data-action=addAccount]");value(a,"name",name);value(a,"type",type);value(a,"opening",opening);submit(a);}
 private void setCalendarMonth(ActivityScenario<MainActivity> a,String month)throws Exception{
  String selected=JSONObject.quote(month);
  assertEquals("true",js(a,"(()=>{const input=document.getElementById('period');input.value="+selected+
   ";input.dispatchEvent(new Event('change',{bubbles:true}));return document.getElementById('period').value==="+selected+"})()"));
 }
 private void selectSummaryMonth(ActivityScenario<MainActivity> a,String month)throws Exception{
  openRoute(a,"reports");
  waitJs(a,"!!document.querySelector('nav [data-page=reports][aria-current=page]') && !!document.getElementById('period')");
  setCalendarMonth(a,month);
  openRoute(a,"home");
  waitJs(a,"document.querySelector('main time.dashboard-period')?.dateTime==="+JSONObject.quote(month));
 }
 private void openSummaryAction(ActivityScenario<MainActivity> a,String action)throws Exception{
  click(a,"main [data-action=quickAdd]");
  click(a,"#quick-add-options [data-action="+action+"]");
 }
 private void transaction(ActivityScenario<MainActivity> a,String kind,int account,int target,String amount,String desc)throws Exception{
  click(a,"nav [data-page=home]");openSummaryAction(a,"addTransaction");value(a,"kind",kind);String aid=js(a,"JSON.parse(Android.load()).accounts["+account+"].id");value(a,"account",new JSONArray("["+aid+"]").getString(0));
  if(target>=0){String tid=js(a,"JSON.parse(Android.load()).accounts["+target+"].id");value(a,"target",new JSONArray("["+tid+"]").getString(0));}
  value(a,"desc",desc);value(a,"amount",amount);value(a,"date","2026-10-04");submit(a);
 }
 private Uri document(String name,String mime,byte[] bytes)throws Exception{Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();ContentValues v=new ContentValues();v.put(MediaStore.MediaColumns.DISPLAY_NAME,name);v.put(MediaStore.MediaColumns.MIME_TYPE,mime);v.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS);Uri uri=c.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);assertNotNull(uri);try(OutputStream out=c.getContentResolver().openOutputStream(uri)){out.write(bytes);}return uri;}
 private void waitPicker()throws Exception{long deadline=SystemClock.uptimeMillis()+12000;while(SystemClock.uptimeMillis()<deadline){if(String.valueOf(device.getCurrentPackageName()).contains("documentsui"))return;Thread.sleep(200);}evidence("picker-not-ready");fail("Document picker did not become visible: "+device.getCurrentPackageName()+" "+systemLabels());}
 private String readDocument(Context context,Uri uri)throws Exception{try(InputStream in=context.getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
 private void selectDownload(String name)throws Exception{
  UiObject2 file=device.wait(Until.findObject(By.text(name)),4000);
  if(file==null){UiObject2 roots=device.wait(Until.findObject(By.desc("Show roots")),5000);assertNotNull("File picker roots are accessible",roots);roots.click();UiObject2 downloads=device.wait(Until.findObject(By.text("Downloads")),5000);assertNotNull("Downloads is available",downloads);downloads.click();file=device.wait(Until.findObject(By.text(name)),8000);}
  if(file==null)evidence("download-not-found");assertNotNull("Synthetic file is visible in Android picker: "+name,file);file.click();
 }
 @Before public void emptyTestApp(){
  if(!Boolean.parseBoolean(InstrumentationRegistry.getArguments().getString("preserveWallet"))){
   InstrumentationRegistry.getInstrumentation().getTargetContext().deleteDatabase("wallet.db");
  }
 }
 @Test public void previousApkIsPreservedAndCaptured()throws Exception{
  String previous="com.zagor.ekstre.preview.revision";
  assumeTrue("This test requires the separately installed historical APK",
   device.executeShellCommand("pm list packages "+previous).contains("package:"+previous+"\n"));
  device.executeShellCommand("am start -W -n "+previous+"/com.zagor.ekstre.MainActivity");
   boolean ready=device.wait(Until.hasObject(By.textContains("Parana genel")),15000);evidence("previous-ready-"+ready);assertTrue("Previous APK text visible; package="+device.getCurrentPackageName()+" "+systemLabels(),ready);
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File dir=new File(context.getExternalFilesDir(null),"screens");dir.mkdirs();
  device.takeScreenshot(new File(dir,"previous-apk-home.png"));
  assertEquals("Previous revision is in the foreground", "com.zagor.ekstre.preview.revision", device.getCurrentPackageName());
  assertTrue(device.executeShellCommand("pm list packages com.zagor.ekstre.preview.revision").contains("package:com.zagor.ekstre.preview.revision\n"));
 }
 @Test public void allWalletFlowsUseRealWebViewAndNativeStorage()throws Exception{
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");account(a,"Sentetik banka","bank");click(a,"nav [data-page=wallet]");account(a,"Sentetik nakit","cash");account(a,"Sentetik kart A","card");account(a,"Sentetik kart B","card");
   transaction(a,"income",0,-1,"30000","Maaş");transaction(a,"expense",0,-1,"1000","Market");transaction(a,"expense",1,-1,"100","Nakit gider");transaction(a,"expense",2,-1,"2000","Kart gideri");transaction(a,"refund",2,-1,"500","Kart iadesi");transaction(a,"payment",0,2,"1500","Kart ödemesi");transaction(a,"transfer",0,1,"300","Transfer");
   assertEquals("7",js(a,"JSON.parse(Android.load()).transactions.length"));a.recreate();waitJs(a,"!!document.querySelector('nav [data-page=home]')");assertEquals("7",js(a,"JSON.parse(Android.load()).transactions.length"));
   openRoute(a,"plan");click(a,"[data-action=budget]");value(a,"amount","5000");submit(a);assertEquals("1",js(a,"Object.keys(JSON.parse(Android.load()).budgets).length"));
   click(a,"[data-action=subscription]");value(a,"name","Sentetik abonelik");value(a,"amount","50");value(a,"next","2026-10-15");submit(a);click(a,"[data-pay]");value(a,"paidOn","2026-10-20");submit(a);assertEquals("\"2026-10-20\"",js(a,"JSON.parse(Android.load()).transactions.at(-1).date"));
   click(a,"nav [data-page=home]");click(a,"nav [data-page=reports]");waitJs(a,"document.body.innerText.includes('Kategori dağılımı')");
   waitJs(a,"document.querySelectorAll('[data-report-month]').length===6");
   value(a,"report-range","12");
   waitJs(a,"document.querySelectorAll('[data-report-month]').length===12 && document.activeElement.id==='f-report-range'");
   device.pressBack();
   waitJs(a,"document.activeElement.matches('button[data-page=reports]')");
   click(a,"#more");waitJs(a,"!!document.querySelector('#modal[open] #more-options')");
   device.pressBack();
   waitJs(a,"!document.querySelector('#modal[open]') && document.activeElement.id==='more'");
   // Verify a real Android file picker can open and cancel, then exercise actual ContentResolver PDF bytes.
   openRoute(a,"import");click(a,"[data-action=pdf]");waitPicker();evidence("pdf-picker");assertTrue("PDF picker package="+device.getCurrentPackageName()+" "+systemLabels(),device.getCurrentPackageName().contains("documentsui"));device.pressBack();
   Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();PDFBoxResourceLoader.init(context);byte[] pdfBytes;
   try(PDDocument pdf=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){PDPage p=new PDPage();pdf.addPage(p);try(PDPageContentStream stream=new PDPageContentStream(pdf,p)){stream.beginText();stream.setFont(PDType1Font.HELVETICA,12);stream.setLeading(18);stream.newLineAtOffset(30,700);for(String line:new String[]{"QNB","Hesap Kesim Tarihi: 05/10/2026","04/10/2026 SENTETIK MARKET 123.00"}){stream.showText(line);stream.newLine();}stream.endText();}pdf.save(out);pdfBytes=out.toByteArray();}
   Uri uri=document("ekstre-synthetic.pdf","application/pdf",pdfBytes);
   Uri broken=document("ekstre-synthetic-broken.pdf","application/pdf","Not a PDF".getBytes(StandardCharsets.UTF_8));
   try{
    waitJs(a,"document.querySelector('#toast').textContent.includes('iptal edildi')");
    for(int i=0;i<2;i++){
     click(a,i==0?"[data-action=retryImport]":"[data-action=pdf]");waitPicker();selectDownload("ekstre-synthetic.pdf");
     waitJs(a,"!!document.querySelector('#import-account') && document.activeElement.id==='statement-preview-title'");
     waitJs(a,"!!document.querySelector('.statement-movement-group h4')");
     String card=js(a,"JSON.parse(Android.load()).accounts[3].id");
     js(a,"document.getElementById('import-account').value="+card);
     click(a,"#acknowledge-import");click(a,"[data-action=confirmImport]");
    }
    assertEquals("9",js(a,"JSON.parse(Android.load()).transactions.length"));
    String original=js(a,"Android.load()"),recovery=js(a,"Android.recovery()");
    click(a,"[data-action=pdf]");waitPicker();selectDownload("ekstre-synthetic.pdf");
    waitJs(a,"!!document.querySelector('#import-account')");
    click(a,"#acknowledge-import");
    assertEquals("true",js(a,"!document.querySelector('[data-action=confirmImport]').disabled"));
    click(a,"[data-action=pdf]");waitPicker();
    assertEquals("true",js(a,"!document.querySelector('[data-action=confirmImport]')"));
    selectDownload("ekstre-synthetic-broken.pdf");
    waitJs(a,"document.querySelector('#error-announcement').textContent.includes('PDF okunamadı') && document.activeElement.matches('[data-action=retryImport]')");
    assertEquals("true",js(a,"!document.querySelector('[data-action=confirmImport]')"));
    assertEquals(original,js(a,"Android.load()"));
    assertEquals(recovery,js(a,"Android.recovery()"));
   }finally{context.getContentResolver().delete(uri,null,null);context.getContentResolver().delete(broken,null,null);}
   // CSV still passes through its actual file-input change handler, using a synthetic File.
   js(a,"(()=>{const input=document.getElementById('csv-file'),dt=new DataTransfer();dt.items.add(new File(['bank,kart,period,date,desc,amount_cents,category,tur\\nQNB,Kart,2026-10,2026-10-05,SENTETIK CSV,8000,Market,harcama'],'synthetic.csv',{type:'text/csv'}));input.files=dt.files;input.dispatchEvent(new Event('change'));})()");waitJs(a,"!!document.querySelector('#modal[data-variant=statement-csv][open] .csv-source-card [name=card-0]')");submit(a);assertEquals("10",js(a,"JSON.parse(Android.load()).transactions.length"));
   // Native restore is atomic and retains the previous JSON; UI restore is separately tested in Chrome.
   AtomicReference<MainActivity.Bridge> bridge=new AtomicReference<>();a.onActivity(activity->bridge.set(activity.new Bridge()));String backup=bridge.get().load();JSONObject changed=new JSONObject(backup);changed.put("syntheticExtra","keep recovery");assertTrue(SnapshotAtomicityTest.saveFixture(bridge.get(),changed.toString()));assertTrue(RecoverySafetyTest.restoreFixture(bridge.get(),backup));assertTrue(new JSONObject(bridge.get().recovery()).has("syntheticExtra"));assertEquals(10,new JSONObject(bridge.get().load()).getJSONArray("transactions").length());
   a.recreate();waitJs(a,"!!document.querySelector('main [data-action=quickAdd]')");assertEquals("10",js(a,"JSON.parse(Android.load()).transactions.length"));
  }
 }
 private JSONObject layoutCase(ActivityScenario<MainActivity> a,String page,int width,File dir)throws Exception{
  android.util.Log.i("EkstreTest","Native layout: "+page+" / "+width);drawn(a);
  JSONObject report=new JSONObject(js(a,"(()=>{const failures=[],money=[],viewport=document.documentElement.clientWidth;if(document.documentElement.scrollWidth>viewport+1)failures.push('page-overflow');for(const e of document.querySelectorAll('main .money,dialog .money')){const r=document.createRange();r.selectNodeContents(e);const t=r.getBoundingClientRect(),b=e.getBoundingClientRect();money.push({text:e.textContent,right:t.right,boxRight:b.right,font:getComputedStyle(e).fontSize});if(t.left<b.left-1||t.right>b.right+1||t.right>viewport+1)failures.push('money-clipped:'+e.textContent);}for(const row of document.querySelectorAll('main .row,main .chart-label,main .grid,main .summary-grid,main .comparison-values,main .quick-actions,main .compact-totals>div,main .card-details>div')){const children=[...row.children];for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){const x=children[i].getBoundingClientRect(),y=children[j].getBoundingClientRect();if(x.left<y.right-1&&y.left<x.right-1&&x.top<y.bottom-1&&y.top<x.bottom-1)failures.push('sibling-overlap:'+row.className);}}return {viewport,innerWidth,failures,money};})()"));
  report.put("page",page);report.put("width",width);
  AtomicInteger bottom=new AtomicInteger(),safeBottom=new AtomicInteger();a.onActivity(activity->{WebView w=web(activity);int[] location=new int[2];w.getLocationOnScreen(location);bottom.set(location[1]+w.getHeight());safeBottom.set(device.getDisplayHeight()-w.getRootWindowInsets().getInsets(WindowInsets.Type.navigationBars()).bottom);});
  report.put("webBottom",bottom.get());report.put("safeBottom",safeBottom.get());if(bottom.get()>safeBottom.get())report.getJSONArray("failures").put("system-bar-overlap");
  assertTrue("Android screenshot captured",device.takeScreenshot(new File(dir,"android-"+page+"-"+width+"-200.png")));return report;
 }
 @Test public void keyboardBackAndModal()throws Exception{
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");click(a,"[data-action=demo]");
   click(a,"#quick-add");
   waitJs(a,"document.activeElement.id==='dialog-title' && document.activeElement.textContent==='Hızlı Ekle'");
   device.pressBack();
   waitJs(a,"!document.querySelector('dialog[open]') && document.activeElement.id==='quick-add'");
   click(a,"#quick-add");click(a,"#quick-add-options [data-action=addTransaction]");drawn(a);
   waitJs(a,"document.activeElement.id==='dialog-title'");
   // WebView DOM inputs are not reliably exposed as android.widget.EditText.
   // Tap the rendered input on the device; focus and real IME remain mandatory.
   js(a,"document.querySelector('[name=desc]').scrollIntoView({block:'center'})");drawn(a);
   JSONObject rect=new JSONObject(js(a,"(()=>{const r=document.querySelector('[name=desc]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,viewport:innerWidth};})()"));
   AtomicInteger tapX=new AtomicInteger(),tapY=new AtomicInteger();a.onActivity(activity->{WebView w=web(activity);int[] offset=new int[2];w.getLocationOnScreen(offset);double scale=w.getWidth()/rect.optDouble("viewport",1);tapX.set(offset[0]+(int)Math.round(rect.optDouble("x")*scale));tapY.set(offset[1]+(int)Math.round(rect.optDouble("y")*scale));});
   assertTrue("Rendered description input accepts a native touch",device.click(tapX.get(),tapY.get()));
   waitJs(a,"document.activeElement===document.querySelector('[name=desc]')");
   assertTrue("Software keyboard opens",waitForIme(a,true));
   js(a,"document.getElementById('submit').scrollIntoView({block:'end'})");drawn(a);evidence("keyboard-open");
   assertEquals("Submit remains reachable above the keyboard","true",js(a,"(()=>{const r=document.getElementById('submit').getBoundingClientRect();return r.top>=0&&r.bottom<=visualViewport.height+1;})()"));
   device.pressBack();
   assertTrue("First Back hides the software keyboard",waitForIme(a,false));
   assertEquals("Dialog stays open after the keyboard is dismissed","true",js(a,"!!document.querySelector('dialog[open]')"));
   device.pressBack();
   waitJs(a,"!document.querySelector('dialog[open]') && document.activeElement.id==='quick-add'");
  }
 }
 @Test public void categorySuggestionAt320DpAndLargeText()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String version=context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionName;
  String apply="[data-action=applyCategorySuggestion]",choose="[data-action=chooseTransactionCategory]";
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");
   click(a,"[data-action=demo]");
   assertEquals("true",js(a,"(()=>{const s=JSON.parse(Android.load());s.merchantCategoryRules=[{id:'category-rule',merchant:s.transactions[0].desc,category:'Giyim'}];return Android.save(JSON.stringify(s),Android.loadForCompare().slice(0,64));})()"));
   try{
    device.executeShellCommand("wm size 320x844");device.executeShellCommand("wm density 160");
    device.executeShellCommand("settings put system font_scale 2.0");
    a.recreate();
    waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
    String original=js(a,"Android.load()"),totals=js(a,"[...document.querySelectorAll('[data-stat]')].map(e=>e.textContent)");
    click(a,"#settings");
    assertEquals(JSONObject.quote("Android sürümü "+version),js(a,"document.querySelector('.settings-intro > p').textContent"));
    openRoute(a,"transactions");
    try{
     waitJs(a,"innerWidth===320 && Android.textZoom()===200 && document.querySelectorAll('nav button').length===4 && !!document.querySelector('"+apply+"')");
    }catch(AssertionError failure){
     String layout=js(a,"({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,"+
      "textZoom:Android.textZoom(),navButtons:document.querySelectorAll('nav button').length,hasSuggestion:!!document.querySelector('"+apply+"'),"+
      "period:document.querySelector('#period')?.value,fixturePeriod:JSON.parse(Android.load()).transactions[0].period})");
     throw new AssertionError("Category suggestion layout: "+layout,failure);
    }
    assertEquals("Actions fit at large text and have accessible context","true",js(a,"[...document.querySelectorAll('.transaction-category-suggestion button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=48&&r.height>=48&&!!b.getAttribute('aria-label')&&!!document.getElementById(b.getAttribute('aria-describedby'));})"));
    assertEquals("true",js(a,"document.querySelector('.transaction-category-suggestion').textContent.includes('Önerilen kategori: Giyim')"));
    js(a,"document.querySelector('.transaction-with-suggestion').scrollIntoView({block:'center'})");drawn(a);evidence("category-suggestion-320-200");
    click(a,choose);
    waitJs(a,"document.activeElement.id==='dialog-title' && document.activeElement.textContent==='Kategori seç'");
    value(a,"category","Eğitim");
    assertEquals("Selecting without saving changes no native bytes",original,js(a,"Android.load()"));
    device.pressBack();
    waitJs(a,"!document.querySelector('dialog[open]') && document.activeElement.matches('"+choose+"')");
    assertEquals(original,js(a,"Android.load()"));
    click(a,apply);
    waitJs(a,"!document.querySelector('"+apply+"') && document.activeElement.matches('[data-edit]')");
    JSONObject expected=new JSONObject(new JSONArray("["+original+"]").getString(0));
    expected.getJSONArray("transactions").getJSONObject(0).put("category","Giyim");
    JSONObject saved=new JSONObject(new JSONArray("["+js(a,"Android.load()")+"]").getString(0));
    assertEquals("Only the category is saved",expected.toString(),saved.toString());
    click(a,"nav [data-page=home]");
    assertEquals(totals,js(a,"[...document.querySelectorAll('[data-stat]')].map(e=>e.textContent)"));
   }finally{
    device.executeShellCommand("settings put system font_scale 1.0");
    device.executeShellCommand("wm size reset");device.executeShellCommand("wm density reset");
   }
  }
 }
 private boolean waitForIme(ActivityScenario<MainActivity> a,boolean expected)throws InterruptedException{
  AtomicBoolean visible=new AtomicBoolean();
  for(int i=0;i<20;i++){
   a.onActivity(activity->visible.set(web(activity).getRootWindowInsets().isVisible(WindowInsets.Type.ime())));
   if(visible.get()==expected)return true;
   Thread.sleep(200);
  }
  return false;
 }
 @Test(timeout=180000) public void fontScaleSystemBarsAndScreenshots()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File dir=new File(context.getExternalFilesDir(null),"screens");dir.mkdirs();JSONArray reports=new JSONArray();
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");click(a,"[data-action=demo]");
   js(a,"(()=>{const s=JSON.parse(Android.load()),date=new Date().toISOString().slice(0,10),category='Sentetik uzun kategori adı '.repeat(4);s.accounts[0].opening=999999999999;s.accounts[1].opening=999999999999;s.transactions[0].amount=999999999999;s.transactions[0].desc='Sentetik uzun mağaza açıklaması '.repeat(8);s.transactions[0].category=category;s.categories.push(category);s.budgets[date.slice(0,7)+'|Toplam']=999999999999;s.subscriptions.push({id:'native-long-sub',name:'Uzun isimli aylık internet ve dijital içerik aboneliği',account:s.accounts[0].id,amount:999999999999,next:date,category:'Abonelik'});return Android.save(JSON.stringify(s),Android.loadForCompare().slice(0,64));})()");
   try{device.executeShellCommand("settings put system font_scale 2.0");
    for(int width:new int[]{320,360,390,412}){
     device.executeShellCommand("wm size "+width+"x844");device.executeShellCommand("wm density 160");a.recreate();waitJs(a,"!!document.querySelector('main [data-action=quickAdd]')");AtomicInteger zoom=new AtomicInteger();a.onActivity(activity->zoom.set(web(activity).getSettings().getTextZoom()));assertEquals(200,zoom.get());
     reports.put(layoutCase(a,"home",width,dir));
     for(String page:new String[]{"wallet","transactions","plan","reports","import","settings","bankDetail","cardDetail","incomePlans","importPreview","transactionModal","paymentModal","quickAddModal"}){
      js(a,"if(document.querySelector('dialog[open]'))window.handleBack()");
      if(page.equals("settings"))click(a,"#settings");
      else if(page.equals("reports")){
       click(a,"nav [data-page=home]");click(a,"nav [data-page=reports]");
       if(width==320){
        value(a,"report-range","12");
        String reportAccount=js(a,"JSON.parse(Android.load()).transactions[0].account");
        value(a,"report-account",new JSONArray("["+reportAccount+"]").getString(0));
        assertEquals(reportAccount,js(a,"document.getElementById('f-report-account').value"));
        String filtersExpression="['period','f-report-account','f-report-range'].map(id=>document.getElementById(id).value)";
        String reportFilters=js(a,filtersExpression);
        String categoryButton="main button[data-report-category]";
        waitJs(a,"!!document.querySelector('"+categoryButton+"')");
        click(a,categoryButton);
        waitJs(a,"!!document.querySelector('#report-category-transactions button[data-edit]') && !!document.querySelector('nav [data-page=reports][aria-current=page]')");
        reports.put(layoutCase(a,"reportCategory",width,dir));
        a.onActivity(MainActivity::onBackPressed);
        waitJs(a,"document.activeElement.matches('"+categoryButton+"')");
        assertEquals("Report month, account and range survive Back",reportFilters,js(a,filtersExpression));
        click(a,"#report-movements-toggle");
        waitJs(a,"!!document.querySelector('#report-movements:not([hidden]) button[data-edit]')");
       }
       waitJs(a,"document.querySelectorAll('[data-report-month]').length==="+(width==320?12:6));
      }
      else if(page.equals("bankDetail")||page.equals("cardDetail")){click(a,"nav [data-page=wallet]");click(a,page.equals("cardDetail")?"[data-card-view]":"[data-account-view]");}
      else if(page.equals("incomePlans")){click(a,"nav [data-page=home]");click(a,"[data-page=incomePlans]");}
      else if(page.equals("importPreview"))js(a,"window.onPdfText('QNB\\nHesap Kesim Tarihi: 05/10/2026\\n04/10/2026 SENTETIK MAGAZA PEN 4.ndirim 9999999999.99')");
      else if(page.equals("transactionModal")||page.equals("paymentModal")){click(a,"nav [data-page=home]");openSummaryAction(a,page.equals("paymentModal")?"quickPayCard":"addTransaction");}
      else if(page.equals("quickAddModal")){
       click(a,"#quick-add");
       waitJs(a,"document.querySelectorAll('#quick-add-options button').length===4");
       assertEquals("Quick Add tap targets fit the viewport", "true",js(a,"[...document.querySelectorAll('header button,#quick-add-options button,#close')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=document.documentElement.clientWidth+1&&r.width>=48&&r.height>=48;})"));
      }
      else openRoute(a,page);
      reports.put(layoutCase(a,page,width,dir));
     }
    }
   }finally{try(FileOutputStream out=new FileOutputStream(new File(dir,"native-layout-results.json"))){out.write(reports.toString().getBytes(StandardCharsets.UTF_8));}device.executeShellCommand("settings put system font_scale 1.0");device.executeShellCommand("wm size reset");device.executeShellCommand("wm density reset");}
   JSONArray failures=new JSONArray();for(int i=0;i<reports.length();i++){JSONObject report=reports.getJSONObject(i);if(report.getJSONArray("failures").length()>0)failures.put(report);}assertEquals("All native money, overlap and system bar bounds: "+failures,0,failures.length());assertEquals(57,reports.length());
  }
 }
 @Test public void salaryCardPaymentAndIncomePlanStayConsistent()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");account(a,"Sentetik banka","bank","20000");
   click(a,"nav [data-page=wallet]");account(a,"Sentetik kart","card","0");account(a,"Sentetik nakit","cash","0");
   transaction(a,"income",0,-1,"30000","Sentetik maaş");transaction(a,"expense",1,-1,"2000","SENTETIK MARKET");
   click(a,"nav [data-page=wallet]");click(a,"[data-card-view]");click(a,"[data-pay-card]");
   String bank=new JSONArray("["+js(a,"JSON.parse(Android.load()).accounts[0].id")+"]").getString(0);
   value(a,"account",bank);value(a,"amount","2000");value(a,"date","2026-10-04");submit(a);
   selectSummaryMonth(a,"2026-10");
   assertEquals("Salary is income; opening cash is not","true",js(a,"document.querySelector('[data-stat=income]').textContent.includes('30.000,00')"));
   assertEquals("Repayment is not another expense","true",js(a,"document.querySelector('[data-stat=netExpense]').textContent.includes('2.000,00')"));
   assertEquals("Cash left after repayment","true",js(a,"document.querySelector('[data-stat=cash]').textContent.includes('48.000,00')"));
   assertEquals("Paid card has no debt","true",js(a,"document.querySelector('[data-stat=cardDebt]').textContent.trim()==='₺0,00'"));
   PDFBoxResourceLoader.init(context);byte[] bytes;
   try(PDDocument pdf=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){
    PDPage page=new PDPage();pdf.addPage(page);try(PDPageContentStream stream=new PDPageContentStream(pdf,page)){
     stream.beginText();stream.setFont(PDType1Font.HELVETICA,12);stream.setLeading(18);stream.newLineAtOffset(30,700);
     for(String line:new String[]{"QNB","Hesap Kesim Tarihi: 05/10/2026","Onceki Donem Hesap Ozeti Borcu: 0.00","Donem Borcu: 0.00","04/10/2026 SENTETIK MARKET 2000.00","04/10/2026 ODEME TESEKKUR 2000.00"}){stream.showText(line);stream.newLine();}stream.endText();
    }pdf.save(out);bytes=out.toByteArray();
   }
   Uri source=document("synthetic-matched-payment.pdf","application/pdf",bytes);
   try{
    openRoute(a,"import");click(a,"[data-action=pdf]");waitPicker();selectDownload("synthetic-matched-payment.pdf");
    waitJs(a,"!!document.querySelector('#import-account')");click(a,"[data-action=confirmImport]");
    assertEquals("5",js(a,"JSON.parse(Android.load()).transactions.length"));
    click(a,"nav [data-page=home]");click(a,"[data-page=review]");
    for(int count=1;count<=2;count++){
     String before=js(a,"Android.load()");
     click(a,"[data-link]");
     waitJs(a,"document.querySelector('#modal[open][data-variant=review-decision] #submit')?.textContent==='Kaynakları bağla'");
     assertEquals("Review preview must not write before confirmation",before,js(a,"Android.load()"));
     submit(a);
     waitJs(a,"JSON.parse(Android.load()).transactions.filter(t=>t.linkedTo).length==="+count);
    }
    click(a,"nav [data-page=home]");assertEquals("No second bank outflow from PDF","true",js(a,"document.querySelector('[data-stat=cash]').textContent.includes('48.000,00')"));
    assertEquals("No second expense from PDF","true",js(a,"document.querySelector('[data-stat=netExpense]').textContent.includes('2.000,00')"));
    click(a,"nav [data-page=reports]");assertEquals("Income remains in report","true",js(a,"document.querySelector('[data-stat=income]').textContent.includes('30.000,00')"));
   }finally{context.getContentResolver().delete(source,null,null);}
   openRoute(a,"plan");click(a,"[data-action=incomePlan]");value(a,"name","Sentetik gelir planı");value(a,"amount","30000");value(a,"next","2026-11-03");submit(a);
   assertEquals("5",js(a,"JSON.parse(Android.load()).transactions.length"));
   click(a,"[data-income-receive]");value(a,"receivedOn","2026-11-05");submit(a);
   assertEquals("\"2026-11-05\"",js(a,"JSON.parse(Android.load()).transactions.at(-1).date"));
   assertEquals("\"2026-11-03\"",js(a,"JSON.parse(Android.load()).transactions.at(-1).incomePlanDue"));
   a.recreate();waitJs(a,"!!document.querySelector('main [data-action=quickAdd]')");assertEquals("6",js(a,"JSON.parse(Android.load()).transactions.length"));
  }
 }
 @Test public void backupFileRoundTripRetainsRecovery()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();Uri output=document("synthetic-wallet-backup.json","application/json",new byte[0]);
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");click(a,"[data-action=demo]");AtomicReference<MainActivity.Bridge> ref=new AtomicReference<>();a.onActivity(activity->ref.set(activity.new Bridge()));
   String original=ref.get().load();int originalAccounts=new JSONObject(original).getJSONArray("accounts").length();
   click(a,"#settings");click(a,"[data-action=backup]");waitPicker();
   // Keep the real picker and ContentResolver; inject only its URI result boundary.
   a.onActivity(activity->activity.onActivityResult(103,Activity.RESULT_OK,new Intent().setData(output)));
   String written="";for(int i=0;i<50;i++){written=readDocument(context,output);if(written.equals(original))break;Thread.sleep(100);}assertEquals("Native export writes complete JSON bytes",original,written);device.pressBack();
   click(a,"nav [data-page=wallet]");account(a,"Yedek sonrası sentetik hesap","bank");assertEquals(originalAccounts+1,new JSONObject(ref.get().load()).getJSONArray("accounts").length());
   restoreDownload(a,"synthetic-wallet-backup.json");
   waitJs(a,"JSON.parse(Android.load()).accounts.length==="+originalAccounts);assertEquals(3,new JSONObject(ref.get().load()).getJSONArray("transactions").length());assertEquals(originalAccounts+1,new JSONObject(ref.get().recovery()).getJSONArray("accounts").length());
   a.recreate();waitJs(a,"!!document.querySelector('main [data-action=quickAdd]')");assertEquals("3",js(a,"JSON.parse(Android.load()).transactions.length"));
  }finally{context.getContentResolver().delete(output,null,null);}
 }

 @Test public void invalidBackupLinkDoesNotReplaceNativeWallet()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");
   click(a,"[data-action=demo]");
   AtomicReference<MainActivity.Bridge> bridge=new AtomicReference<>();
   a.onActivity(activity->bridge.set(activity.new Bridge()));
   String original=bridge.get().load(),recovery=bridge.get().recovery();
   JSONObject corrupted=new JSONObject(original);
   JSONArray rows=corrupted.getJSONArray("transactions");
   rows.getJSONObject(1).put("source","csv").put("matchStatus","linked").put("linkedTo",rows.getJSONObject(0).getString("id"));
   assertRejectedRestore(a,context,bridge.get(),"synthetic-malformed.json","GizliX-Isaret-123",
    "Yedek dosyası geçerli bir JSON biçiminde değil.","GizliX|Unexpected token|not valid JSON|SyntaxError");
   assertRejectedRestore(a,context,bridge.get(),"synthetic-invalid-link.json",corrupted.toString(),"işlem bağlantısı",null);

   JSONObject distant=new JSONObject(original);
   JSONArray distantRows=distant.getJSONArray("transactions");
   String card=distantRows.getJSONObject(0).getString("account");
   String bank=distant.getJSONArray("accounts").getJSONObject(0).getString("id");
   distantRows.put(new JSONObject()
    .put("id","synthetic-bank-payment").put("account",bank).put("target",card)
    .put("date","2026-11-30").put("period","2026-11").put("kind","payment").put("source","manual")
    .put("amount",5000).put("desc","Sentetik banka ödemesi").put("category","Kart ödemesi"));
   for(String source:new String[]{"pdf","csv"}){
    boolean pdf=source.equals("pdf");
    JSONObject payment=new JSONObject()
     .put("id","synthetic-"+source+"-payment").put("account",card)
     .put("date",pdf?"2026-10-01":"2026-11-30").put("period",pdf?"2026-10":"2026-11")
     .put("kind","cardPayment").put("source",source).put("amount",5000)
     .put("desc","Sentetik ekstre ödemesi").put("category","Kart ödemesi")
     .put("linkedTo","synthetic-bank-payment").put("matchStatus","linked");
    if(!pdf)payment.put("csvKey","synthetic-legacy-csv");
    distantRows.put(payment);
   }
   assertRejectedRestore(a,context,bridge.get(),"synthetic-distant-link.json",distant.toString(),"PDF ve CSV ödemelerinin tarihleri",null);
   assertEquals(original,bridge.get().load());
   assertEquals(recovery,bridge.get().recovery());
  }
 }
 private void assertRejectedRestore(ActivityScenario<MainActivity> a,Context context,MainActivity.Bridge bridge,
                                    String name,String corrupted,String error,String excluded)throws Exception{
  String original=bridge.load(),recovery=bridge.recovery();
  Uri file=document(name,"application/json",corrupted.getBytes(StandardCharsets.UTF_8));
  try{
   openBackupPicker(a);selectDownload(name);
   waitJs(a,"document.querySelector('#backup-feedback')?.textContent.includes("+JSONObject.quote(error)+")");
   assertEquals("true",js(a,"document.querySelector('#error-announcement').textContent.includes("+JSONObject.quote(error)+")"));
   if(excluded!=null)assertEquals("false",js(a,"new RegExp("+JSONObject.quote(excluded)+",'i').test("
    +"document.querySelector('#backup-feedback').textContent+document.querySelector('#error-announcement').textContent)"));
   assertEquals("true",js(a,"document.activeElement.matches('[data-action=restore]') && !document.querySelector('#toast.visible')"));
   assertEquals(original,bridge.load());
   assertEquals(recovery,bridge.recovery());
  }finally{context.getContentResolver().delete(file,null,null);}
 }
 @Test public void privatePdfIdentitySurvivesWebViewRecreation()throws Exception{
  String first=String.join(" - ","4111","1111","1111","1111");
  String second=String.join(" - ","4000","0000","0006","1111");
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=demo]')");
   click(a,"[data-action=demo]");
   importPrivatePdf(a,first,second);
   String rows="JSON.parse(Android.load()).transactions.filter(row=>row.source==='pdf')";
   assertEquals("2",js(a,rows+".length"));
   String firstId=js(a,rows+"[0].id"),secondId=js(a,rows+"[1].id");
   assertEquals("true",js(a,rows+".every(row=>row.importKey.startsWith('pdf-hmac-v1:'))"));
   a.recreate();
   waitJs(a,"!!document.querySelector('main [data-action=quickAdd]')");
   importPrivatePdf(a,second,first);
   assertEquals(secondId,js(a,rows+"[0].id"));
   assertEquals(firstId,js(a,rows+"[1].id"));
   assertEquals("false",js(a,"Android.load().includes("+JSONObject.quote(first)+")||Android.load().includes("+JSONObject.quote(second)+")"));
   String original=js(a,"Android.load()"),recovery=js(a,"Android.recovery()");
   String changed="QNB\nHesap Kesim Tarihi: 05/10/2026\nOnceki Donem Borcu: 0.00\nDonem Borcu: 125.00\n01/10/2026 SENTETIK KART "+second+" 50.00\n01/10/2026 SENTETIK KART **** 1111 75.00";
   js(a,"window.onPdfText("+JSONObject.quote(changed)+")");
   waitJs(a,"!!document.querySelector('[data-action=confirmImport]:enabled')");
   click(a,"[data-action=confirmImport]");
   waitJs(a,"document.querySelector('#error-announcement').textContent.includes('tekrar aktarımı inceleme')");
   assertEquals(original,js(a,"Android.load()"));
   assertEquals(recovery,js(a,"Android.recovery()"));
  }
 }
 private void importPrivatePdf(ActivityScenario<MainActivity> a,String first,String second)throws Exception{
  String text="QNB\nHesap Kesim Tarihi: 05/10/2026\n01/10/2026 SENTETIK KART "+first+" 50.00\n01/10/2026 SENTETIK KART "+second+" 50.00";
  js(a,"window.onPdfText("+JSONObject.quote(text)+")");
  waitJs(a,"!!document.querySelector('#import-account')");
  js(a,"(()=>{const select=document.querySelector('#import-account');select.value=JSON.parse(Android.load()).accounts.find(a=>a.type==='card').id;select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  click(a,"#acknowledge-import");
  click(a,"[data-action=confirmImport]");
  waitJs(a,"document.querySelector('#toast').textContent.includes('Ekstre kaydedildi')");
 }
 private void openBackupPicker(ActivityScenario<MainActivity> a)throws Exception{
  // The static settings button exists before app.mjs registers its click handler.
  waitJs(a,"!!document.querySelector('#settings[data-page=settings]')");
  click(a,"#settings");
  waitJs(a,"!!document.querySelector('[data-action=restore]')");
  js(a,"document.querySelector('[data-action=restore]').scrollIntoView({block:'center',behavior:'instant'})");
  drawn(a);
  JSONObject rect=new JSONObject(js(a,"(()=>{const button=document.querySelector('[data-action=restore]'),r=button.getBoundingClientRect();const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;return {x,y,viewport:innerWidth,visible:button.contains(document.elementFromPoint(x,y))};})()"));
  if(!rect.getBoolean("visible"))evidence("restore-button-not-visible");
  assertTrue("Restore button is visible at its rendered center",rect.getBoolean("visible"));
  AtomicInteger tapX=new AtomicInteger(),tapY=new AtomicInteger();
  a.onActivity(activity->{
   WebView w=web(activity);int[] offset=new int[2];w.getLocationOnScreen(offset);
   double scale=w.getWidth()/rect.optDouble("viewport");
   tapX.set(offset[0]+(int)Math.round(rect.optDouble("x")*scale));
   tapY.set(offset[1]+(int)Math.round(rect.optDouble("y")*scale));
  });
  assertTrue("Restore button receives a native touch",device.click(tapX.get(),tapY.get()));
  waitPicker();
 }
 private void restoreDownload(ActivityScenario<MainActivity> a,String name)throws Exception{
  restoreDownload(a,name,false);
 }
 private void restoreDownload(ActivityScenario<MainActivity> a,String name,boolean baselineNativeConfirmation)throws Exception{
  openBackupPicker(a);selectDownload(name);
  if(baselineNativeConfirmation){
   UiObject2 confirm=device.wait(Until.findObject(By.res("android:id/button1")
     .text(java.util.regex.Pattern.compile("(?iu)^onayla$"))),10000);
   if(confirm==null)evidence("baseline-restore-no-confirm");
   assertNotNull("Baseline restore asks for native Onayla before replacing wallet",confirm);
   confirm.click();
   return;
  }
  String confirm="#modal[open][data-variant=backup-replace] #submit";
  waitJs(a,"!!document.querySelector('"+confirm+"')");
  assertEquals("\"Cüzdanı değiştir\"",js(a,"document.querySelector('"+confirm+"').textContent"));
  click(a,confirm);
 }
 @Test public void restorePreviousTrialBackup()throws Exception{
  String path=InstrumentationRegistry.getArguments().getString("previousTrialBackup");
  boolean baselineNativeConfirmation=Boolean.parseBoolean(InstrumentationRegistry.getArguments().getString("baselineNativeRestoreConfirmation"));
  assumeTrue("Requires the synthetic snapshot from the installed 0.3.0 trial",path!=null);
  String raw=device.executeShellCommand("cat "+path);
  JSONObject expected=new JSONObject(raw);
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String name="synthetic-from-0.3.0.json";
  Uri file=document(name,"application/json",raw.getBytes(StandardCharsets.UTF_8));
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('#settings')");
   restoreDownload(a,name,baselineNativeConfirmation);
   waitJs(a,"JSON.parse(Android.load())?.accounts?.some(a=>a.id==='synthetic-card') === true");
   a.recreate();
   assertMigratedWallet(a,expected,baselineNativeConfirmation);
  }finally{context.getContentResolver().delete(file,null,null);}
 }

 @Test public void upgradedWalletSurvivesRestart()throws Exception{
  String path=InstrumentationRegistry.getArguments().getString("previousTrialBackup");
  assumeTrue("Requires an in-place upgrade on the disposable emulator",
   path!=null&&Boolean.parseBoolean(InstrumentationRegistry.getArguments().getString("preserveWallet")));
  JSONObject expected=new JSONObject(device.executeShellCommand("cat "+path));
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   assertMigratedWallet(a,expected,false);
   a.recreate();
   assertMigratedWallet(a,expected,false);
  }
 }
 @Test public void oldWalletRejectsObservationBackupAndCanStillSave()throws Exception{
  String path=InstrumentationRegistry.getArguments().getString("observationBackup");
  assumeTrue("Requires the old APK on the disposable emulator",path!=null);
  String raw=device.executeShellCommand("cat "+path);
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String name="synthetic-observation-for-old.apk-test.json";
  Uri file=document(name,"application/json",raw.getBytes(StandardCharsets.UTF_8));
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");
   account(a,"Sentetik eski banka","bank");
   String before=js(a,"Android.load()");
   String recovery=js(a,"Android.recovery()");
   openBackupPicker(a);
   selectDownload(name);
   waitJs(a,"document.querySelector('#toast').textContent.includes('Bu dosya Android cüzdan yedeği değil.')");
   assertEquals(before,js(a,"Android.load()"));
   assertEquals(recovery,js(a,"Android.recovery()"));
   assertEquals("false",js(a,"Android.restore("+JSONObject.quote(raw)+")"));
   assertEquals(before,js(a,"Android.load()"));
   click(a,"nav [data-page=wallet]");
   account(a,"Sentetik yeniden kayıt","cash");
   waitJs(a,"JSON.parse(Android.load()).version===1 && JSON.parse(Android.load()).accounts.length===2");
  }finally{context.getContentResolver().delete(file,null,null);}
 }
 @Test public void newWalletRestoresOriginalObservationBackup()throws Exception{
  String path=InstrumentationRegistry.getArguments().getString("observationBackup");
  assumeTrue("Requires the observation backup from the disposable emulator",path!=null);
  String raw=device.executeShellCommand("cat "+path);
  JSONObject expected=new JSONObject(raw);
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String name="synthetic-observation-for-new.apk-test.json";
  Uri file=document(name,"application/json",raw.getBytes(StandardCharsets.UTF_8));
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
   String before=js(a,"Android.load()");
   restoreDownload(a,name);
   waitJs(a,"JSON.parse(Android.load()).version===2");
   assertEquals(before,js(a,"Android.recovery()"));
   a.recreate();
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
   String saved=new JSONArray("["+js(a,"Android.load()")+"]").getString(0);
   JSONObject restored=new JSONObject(saved);
   for(String key:new String[]{"accounts","transactions","balanceReconciliation"}){
    assertEquals(expected.get(key).toString(),restored.get(key).toString());
   }
   try(FileOutputStream out=context.openFileOutput("synthetic-observation-backup.json",Context.MODE_PRIVATE)){
    out.write(saved.getBytes(StandardCharsets.UTF_8));
   }
  }finally{context.getContentResolver().delete(file,null,null);}
 }
 @Test public void previousV2WalletRejectsV3BackupAndCanStillSave() throws Exception {
  String path=InstrumentationRegistry.getArguments().getString("approvalBackup");
  String previousPath=InstrumentationRegistry.getArguments().getString("previousV2Backup");
  assumeTrue("Requires the previous v2-capable APK on the disposable emulator",path!=null&&previousPath!=null);
  String raw=device.executeShellCommand("cat "+path);
  String oldBackup=device.executeShellCommand("cat "+previousPath);
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String name="synthetic-v3-for-previous-android.json";
  Uri file=document(name,"application/json",raw.getBytes(StandardCharsets.UTF_8));
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");
   assertEquals("true",js(a,"Android.restore("+JSONObject.quote(oldBackup)+")"));
   a.recreate();
   waitJs(a,"JSON.parse(Android.load()).version===2");
   String before=js(a,"Android.load()"),recovery=js(a,"Android.recovery()");
   openBackupPicker(a);
   selectDownload(name);
   waitJs(a,"document.querySelector('#toast').textContent.includes('Bu Android cüzdan yedeği sürümü desteklenmiyor.')");
   assertEquals("false",js(a,"Android.restore("+JSONObject.quote(raw)+")"));
   assertEquals(before,js(a,"Android.load()"));
   assertEquals(recovery,js(a,"Android.recovery()"));
   click(a,"nav [data-page=wallet]");
   account(a,"Sentetik yeniden kayıt","cash");
   waitJs(a,"JSON.parse(Android.load()).version===2 && JSON.parse(Android.load()).accounts.length===2");
  }finally{context.getContentResolver().delete(file,null,null);}
 }

 @Test public void newWalletRestoresV3ApprovalBackup() throws Exception {
  String path=InstrumentationRegistry.getArguments().getString("approvalBackup");
  assumeTrue("Requires a synthetic v3 backup on the disposable upgrade emulator",path!=null);
  String raw=device.executeShellCommand("cat "+path);
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String name="synthetic-v3-for-candidate-android.json";
  Uri file=document(name,"application/json",raw.getBytes(StandardCharsets.UTF_8));
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
   String before=js(a,"Android.load()");
   assertEquals("2",js(a,"JSON.parse(Android.load()).version"));
   restoreDownload(a,name);
   waitJs(a,"JSON.parse(Android.load()).version===3");
   assertEquals(before,js(a,"Android.recovery()"));
   a.recreate();
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
   String saved=new JSONArray("["+js(a,"Android.load()")+"]").getString(0);
   JSONObject expected=new JSONObject(raw),restored=new JSONObject(saved);
   assertEquals(expected.getJSONObject("balanceReconciliation").toString(),
    restored.getJSONObject("balanceReconciliation").toString());
  }finally{context.getContentResolver().delete(file,null,null);}
 }

 private void prepareNativeBalanceReview(ActivityScenario<MainActivity> a,String movementSource) throws Exception {
  waitJs(a,"!!document.getElementById('balance-anchor-form')");
  js(a,"""
   document.getElementById('f-balance-anchor').value='anchor';
   document.getElementById('f-balance-anchor-ref').value='synthetic closing';
   document.getElementById('f-balance-anchor-date').value='2026-11-01';
   document.getElementById('f-balance-anchor-amount').value='1000,00';
   document.getElementById('balance-closing-confirmed').checked=true;
   document.getElementById('balance-anchor-form').requestSubmit();
   """);
  waitJs(a,"!!document.getElementById('balance-coverage-form')");
  js(a,"document.getElementById('f-balance-coverage-ref').value="+JSONObject.quote(movementSource));
  js(a,"""
   document.getElementById('f-balance-row-ref-1').value='synthetic row';
   document.getElementById('f-balance-row-date-1').value='2026-11-10';
   document.getElementById('f-balance-row-amount-1').value='1,00';
   document.getElementById('balance-coverage-confirmed').checked=true;
   document.getElementById('balance-coverage-form').requestSubmit();
   """);
  waitJs(a,"!!document.getElementById('balance-final-form')");
  assertEquals("true",js(a,"""
   (()=>{const summary=document.querySelector('[aria-labelledby=balance-result-title]');
     return summary.textContent.includes('Kapsam kaynak satırlarıyla desteklendi') && !summary.querySelector('.warning');
   })()
   """));
  assertEquals("true",js(a,"document.getElementById('balance-save').disabled"));
 }

 private void submitNativeBalanceReviewTwice(ActivityScenario<MainActivity> a) throws Exception {
  click(a,"#balance-confirmed");
  assertEquals("false",js(a,"document.getElementById('balance-save').disabled"));
  js(a,"""
   (()=>{const button=document.getElementById('balance-save');
     button.click();
     button.click();
   })()
   """);
 }

 @Test public void balanceApprovalFlowCommitsThroughNativeCasAndReopens() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  JSONObject wallet;
  try(var input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("synthetic-reconciliation-v3.json");
      var output=new ByteArrayOutputStream()){
   byte[] buffer=new byte[4096];
   for(int count;(count=input.read(buffer))!=-1;)output.write(buffer,0,count);
   wallet=new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));
  }
  wallet.put("version",2);
  JSONObject section=wallet.getJSONObject("balanceReconciliation");
  section.remove("approvals");
  JSONArray observations=section.getJSONArray("observations");
  observations.getJSONObject(0).put("observedAmountCents",100000);
  observations.getJSONObject(1).put("observedAmountCents",100100);
  wallet.getJSONArray("accounts").put(new JSONObject(
   "{\"id\":\"card\",\"name\":\"Sentetik kart\",\"type\":\"card\",\"opening\":2500}"));
  wallet.getJSONArray("transactions").put(new JSONObject("{\"id\":\"card-expense\",\"account\":\"card\","
   +"\"kind\":\"expense\",\"date\":\"2026-11-10\",\"amount\":800,\"desc\":\"Sentetik\",\"category\":\"Diğer\","
   +"\"period\":\"2026-11\",\"source\":\"manual\"}"));
  String v2=wallet.toString();
  String reopenExpected;
  String homeStats;
  String renderedStats="Array.from(document.querySelectorAll('[data-stat]'),e=>e.textContent)";
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");
   account(a,"Sentetik kurtarma","cash");
   String recovery=js(a,"Android.load()");
   assertEquals("true",js(a,"Android.restoreChecked(Android.loadForCompare().slice(0,64),1,Android.loadForCompare().slice(0,64),"+JSONObject.quote(v2)+")"));
   a.recreate();
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
   String previous=js(a,"Android.load()");
   assertEquals("2",js(a,"JSON.parse(Android.load()).version"));
   homeStats=js(a,renderedStats);

   click(a,"nav [data-page=wallet]");
   click(a,"[data-account-view=bank]");
   click(a,"[data-balance-review=observation]");
   prepareNativeBalanceReview(a,"synthetic statement");
   js(a,"document.getElementById('balance-final-form').requestSubmit()");
   assertEquals(previous,js(a,"Android.load()"));

   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    database.execSQL("CREATE TRIGGER abort_approval_test BEFORE INSERT ON snapshots WHEN NEW.id=1"
     +" BEGIN SELECT RAISE(ABORT, 'synthetic-approval-write-failure'); END");
    try{
     submitNativeBalanceReviewTwice(a);
     waitJs(a,"!!document.querySelector('[data-action=balanceRestart]') && !document.getElementById('balance-save')");
     assertEquals(previous,js(a,"Android.load()"));
     assertEquals(recovery,js(a,"Android.recovery()"));
     try(var snapshots=database.rawQuery("SELECT content FROM snapshots WHERE id=2",null)){
      assertTrue(snapshots.moveToFirst());
      assertEquals(new JSONArray("["+recovery+"]").getString(0),snapshots.getString(0));
     }
    }finally{database.execSQL("DROP TRIGGER IF EXISTS abort_approval_test");}
   }
   assertEquals("true",js(a,"!document.getElementById('balance-final-form')"));
   assertEquals(previous,js(a,"Android.load()"));
   click(a,"[data-action=balanceRestart]");
   prepareNativeBalanceReview(a,"synthetic statement");
   submitNativeBalanceReviewTwice(a);
   waitJs(a,"!!document.getElementById('balance-review-saved')");
   assertEquals("true",js(a,"""
    (()=>{const wallet=JSON.parse(Android.load()),rows=wallet.balanceReconciliation.approvals;
      const evidence=JSON.parse(rows[0].evidenceJson);
      return wallet.version===3 && rows.length===1 && rows[0].previousApprovalId===null &&
       evidence.coverage.status==='source-supported' && evidence.differenceCents==='0';
    })()
    """));
   String firstApproval=js(a,"JSON.stringify(JSON.parse(Android.load()).balanceReconciliation.approvals[0])");
   click(a,"[data-action=balanceBack]");
   click(a,"[data-balance-review=observation]");
   prepareNativeBalanceReview(a,"synthetic replacement statement");
   submitNativeBalanceReviewTwice(a);
   waitJs(a,"!!document.getElementById('balance-review-saved')");
   assertEquals(firstApproval,js(a,"JSON.stringify(JSON.parse(Android.load()).balanceReconciliation.approvals[0])"));
   assertEquals("true",js(a,"""
    (()=>{const rows=JSON.parse(Android.load()).balanceReconciliation.approvals;
      return rows.length===2 && rows[1].previousApprovalId===rows[0].id;
    })()
    """));
   assertEquals(recovery,js(a,"Android.recovery()"));
   reopenExpected=js(a,"Android.load()");
   JSONObject saved=new JSONObject(new JSONArray("["+reopenExpected+"]").getString(0));
   for(String key:new String[]{"accounts","transactions","statements","budgets","subscriptions","categories"}){
    assertEquals(wallet.get(key).toString(),saved.get(key).toString());
   }
  }
  try(ActivityScenario<MainActivity> reopened=ActivityScenario.launch(MainActivity.class)){
   waitJs(reopened,"!!document.querySelector('[data-stat=cardDebt]')");
   assertEquals(reopenExpected,js(reopened,"Android.load()"));
   assertEquals(homeStats,js(reopened,renderedStats));
  }
 }


 @Test public void splitExpenseFormSavesOneParentAndKeepsFocusAndLargeTextUsable() throws Exception {
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");
   account(a,"Sentetik kart","card","0");
   transaction(a,"expense",0,-1,"1000","Sentetik bölünebilir gider");
   openRoute(a,"transactions");
   js(a,"(()=>{const p=document.querySelector('#period');p.value='2026-10';p.dispatchEvent(new Event('change',{bubbles:true}));})()");
   waitJs(a,"!!document.querySelector('#transactions-list [data-edit]')");
   click(a,"#transactions-list [data-edit]");
   a.onActivity(activity->web(activity).getSettings().setTextZoom(200));
   click(a,"#start-expense-allocation");
   waitJs(a,"document.activeElement.id==='f-allocation-category-1'");
   waitJs(a,"document.querySelector('#modal').scrollWidth===document.querySelector('#modal').clientWidth");
   value(a,"allocation-category-1","Market / Gıda");value(a,"allocation-amount-1","600");
   value(a,"allocation-category-2","Dışarıda yeme");value(a,"allocation-amount-2","399,99");
   click(a,"#submit");
   waitJs(a,"document.activeElement.id==='form-error' && JSON.parse(Android.load()).version===1");
   value(a,"allocation-amount-2","400");
   click(a,"#add-expense-allocation");
   waitJs(a,"document.activeElement.id==='f-allocation-category-3'");
   click(a,"[data-remove-allocation='3']");
   waitJs(a,"document.activeElement.id==='f-allocation-category-2'");
   submit(a);
   waitJs(a,"document.activeElement.matches('#transactions-list [data-edit]')");
   waitJs(a,"(()=>{const w=JSON.parse(Android.load());const t=w.transactions[0];return w.version===4&&w.transactions.length===1&&t.amount===100000&&w.expenseAllocations[t.id].map(p=>p.amount).join()==='60000,40000';})()");
   click(a,"#transactions-list [data-edit]");
   click(a,"#clear-expense-allocation");
   device.pressBack();
   waitJs(a,"!document.querySelector('dialog[open]') && document.activeElement.matches('#transactions-list [data-edit]')");
   waitJs(a,"Object.keys(JSON.parse(Android.load()).expenseAllocations).length===1");
  }
 }

 @Test public void splitBridgeRejectsInvalidReplayAndStaleWritesAtomically() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");
   account(a,"Sentetik kurtarma","cash","0");
   JSONObject v3=syntheticApprovalHistory();
   assertEquals("true",js(a,"Android.restoreChecked(Android.loadForCompare().slice(0,64),1,Android.loadForCompare().slice(0,64),"+JSONObject.quote(v3.toString())+")"));
   Map<Integer,String> original=nativeSnapshots(context);
   String token=BalanceApprovalStorage.sha256(original.get(1));
   JSONObject v4=new JSONObject(original.get(1)).put("version",4).put("expenseAllocations",
    new JSONObject().put("card-expense",new JSONArray("[{\"category\":\"Market / Gıda\",\"amount\":600},{\"category\":\"Diğer\",\"amount\":200}]")));
   JSONObject invalid=new JSONObject(v4.toString());
   invalid.getJSONObject("expenseAllocations").getJSONArray("card-expense").getJSONObject(1).put("amount",199);
   assertEquals("false",js(a,"Android.save("+JSONObject.quote(invalid.toString())+","+JSONObject.quote(token)+")"));
   assertEquals("false",js(a,"Android.restoreChecked("+JSONObject.quote(token)+",1,"+JSONObject.quote(token)+","+JSONObject.quote(invalid.toString())+")"));
   assertEquals(original,nativeSnapshots(context));
   JSONObject erasedHistory=new JSONObject(v4.toString());
   erasedHistory.getJSONObject("balanceReconciliation").put("approvals",new JSONArray());
   assertEquals("false",js(a,"Android.save("+JSONObject.quote(erasedHistory.toString())+","+JSONObject.quote(token)+")"));
   assertEquals(original,nativeSnapshots(context));
   assertEquals("true",js(a,"Android.save("+JSONObject.quote(v4.toString())+","+JSONObject.quote(token)+")"));
   Map<Integer,String> saved=nativeSnapshots(context);
   assertEquals(original.get(1),saved.get(2));
   assertEquals(original.get(3),saved.get(3));
   assertEquals(v4.toString(),saved.get(1));
   String current=BalanceApprovalStorage.sha256(saved.get(1));
   JSONObject stale=new JSONObject(v4.toString());
   stale.getJSONObject("expenseAllocations").remove("card-expense");
   assertEquals("false",js(a,"Android.save("+JSONObject.quote(v4.toString())+","+JSONObject.quote(token)+")"));
   assertEquals("false",js(a,"Android.save("+JSONObject.quote(stale.toString())+","+JSONObject.quote(token)+")"));
   assertEquals("false",js(a,"Android.save("+JSONObject.quote(v3.toString())+","+JSONObject.quote(current)+")"));
   JSONObject financialChange=new JSONObject(v4.toString());
   JSONArray postedRows=financialChange.getJSONArray("transactions");
   for(int i=0;i<postedRows.length();i++){
    JSONObject row=postedRows.getJSONObject(i);
    if("card-expense".equals(row.getString("id")))row.put("amount",801);
   }
   financialChange.getJSONObject("expenseAllocations").getJSONArray("card-expense").getJSONObject(0).put("amount",601);
   assertEquals("false",js(a,"Android.save("+JSONObject.quote(financialChange.toString())+","+JSONObject.quote(current)+")"));
   assertEquals(saved,nativeSnapshots(context));
   a.recreate();
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]') && JSON.parse(Android.load()).version===4");
   openNativeApprovalHistory(a,"bank");
   assertEquals("2",js(a,"document.querySelectorAll('[data-balance-approval-entry]').length"));
   assertEquals(saved,nativeSnapshots(context));
  }
 }

 private Map<Integer,String> nativeSnapshots(Context context) {
  Map<Integer,String> snapshots=new LinkedHashMap<>();
  try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null);
      var rows=database.rawQuery("SELECT id,content FROM snapshots ORDER BY id",null)){
   while(rows.moveToNext())snapshots.put(rows.getInt(0),rows.getString(1));
  }
  assertEquals("Current, previous and recovery raw snapshots must exist",3,snapshots.size());
  return snapshots;
 }

 private JSONObject syntheticApprovalHistory() throws Exception {
  JSONObject wallet;
  try(var input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("synthetic-reconciliation-v3.json");
      var output=new ByteArrayOutputStream()){
   byte[] buffer=new byte[4096];
   for(int count;(count=input.read(buffer))!=-1;)output.write(buffer,0,count);
   wallet=new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));
  }
  JSONObject reconciliation=wallet.getJSONObject("balanceReconciliation");
  JSONArray observations=reconciliation.getJSONArray("observations");
  for(int index=0;index<2;index++){
   JSONObject cashObservation=new JSONObject(observations.getJSONObject(index).toString());
   cashObservation.put("id",index==0?"cash-anchor":"cash-observation");
   cashObservation.put("accountId","cash");
   cashObservation.put("sourceKind","cashCount");
   observations.put(cashObservation);
  }
  wallet.getJSONArray("accounts").put(new JSONObject(
   "{\"id\":\"cash\",\"name\":\"Sentetik nakit\",\"type\":\"cash\",\"opening\":0}"));
  JSONObject cashIncome=new JSONObject(wallet.getJSONArray("transactions").getJSONObject(0).toString());
  cashIncome.put("id","cash-income");
  cashIncome.put("account","cash");
  wallet.getJSONArray("transactions").put(cashIncome);
  wallet.getJSONArray("accounts").put(new JSONObject(
   "{\"id\":\"card\",\"name\":\"Sentetik kart\",\"type\":\"card\",\"opening\":2500}"));
  wallet.getJSONArray("transactions").put(new JSONObject("{\"id\":\"card-expense\",\"account\":\"card\","
   +"\"kind\":\"expense\",\"date\":\"2026-11-10\",\"amount\":800,\"desc\":\"Sentetik\",\"category\":\"Diğer\","
   +"\"period\":\"2026-11\",\"source\":\"manual\"}"));
  JSONArray approvals=reconciliation.getJSONArray("approvals");
  JSONObject first=approvals.getJSONObject(0),cash=new JSONObject(first.toString());
  String cashEvidence=first.getString("evidenceJson")
   .replace("\"accountId\":\"bank\"","\"accountId\":\"cash\"")
   .replace("\"accountType\":\"bank\"","\"accountType\":\"cash\"")
   .replace("\"id\":\"anchor\"","\"id\":\"cash-anchor\"")
   .replace("\"id\":\"observation\"","\"id\":\"cash-observation\"")
   .replace("synthetic-income","cash-income")
   .replace("bankDocument","cashCount").replace("bankClosingRecord","cashCountRecord")
   .replace("bankStatement","cashJournal");
  cash.put("id","cash-approval").put("approvedAt","2026-11-18T09:00:00.000Z")
   .put("evidenceJson",cashEvidence).put("evidenceSha256",BalanceApprovalStorage.sha256(cashEvidence));
  approvals.put(cash);
  JSONObject second=new JSONObject(first.toString());
  second.put("id","approval-2").put("approvedAt","2026-11-19T09:00:00.000Z")
   .put("previousApprovalId",first.getString("id"));
  approvals.put(second);
  return wallet;
 }

 private void openNativeApprovalHistory(ActivityScenario<MainActivity> a,String account) throws Exception {
  click(a,"nav [data-page=wallet]");
  click(a,"[data-account-view="+account+"]");
  click(a,"[data-balance-history="+account+"]");
  waitJs(a,"!!document.getElementById('balance-approval-history')");
 }

 @Test public void legacyApprovalHistoryNeverWritesOrMigratesSnapshots() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  for(int version:new int[]{1,2}){
   JSONObject legacy=syntheticApprovalHistory();
   legacy.put("version",version);
   if(version==1)legacy.remove("balanceReconciliation");
   else legacy.getJSONObject("balanceReconciliation").remove("approvals");
   try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
    waitJs(a,"!!document.querySelector('nav [data-page=wallet]')");
    click(a,"nav [data-page=wallet]");
    account(a,"Sentetik kurtarma "+version,"cash");
    assertEquals("true",js(a,"Android.restoreChecked(Android.loadForCompare().slice(0,64),1,Android.loadForCompare().slice(0,64),"+JSONObject.quote(legacy.toString())+")"));
    a.recreate();
    waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
    Map<Integer,String> snapshots=nativeSnapshots(context);
    String totals=js(a,"Array.from(document.querySelectorAll('[data-stat]'),e=>e.textContent)");
    openNativeApprovalHistory(a,"bank");
    assertEquals("0",js(a,"document.querySelectorAll('[data-balance-approval-entry]').length"));
    assertEquals(String.valueOf(version),js(a,"JSON.parse(Android.load()).version"));
    assertEquals(snapshots,nativeSnapshots(context));
    device.pressBack();
    waitJs(a,"!!document.querySelector('[data-balance-history=bank]')");
    a.recreate();
    waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
    assertEquals(totals,js(a,"Array.from(document.querySelectorAll('[data-stat]'),e=>e.textContent)"));
    assertEquals(snapshots,nativeSnapshots(context));
   }
  }
 }

 @Test public void approvalHistoryEvaluatesNativeSnapshotWithoutRewritingEvidence() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  JSONObject original=syntheticApprovalHistory();
  String approvals=original.getJSONObject("balanceReconciliation").getJSONArray("approvals").toString();
  String totals;
  Map<Integer,String> afterMissing;
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   waitJs(a,"!!document.querySelector('[data-action=addAccount]')");
   account(a,"Sentetik kurtarma","cash");
   assertEquals("true",js(a,"Android.restoreChecked(Android.loadForCompare().slice(0,64),1,Android.loadForCompare().slice(0,64),"+JSONObject.quote(original.toString())+")"));
   a.recreate();
   waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
   totals=js(a,"Array.from(document.querySelectorAll('[data-stat]'),e=>e.textContent)");
   Map<Integer,String> snapshots=nativeSnapshots(context);
   openNativeApprovalHistory(a,"bank");
   assertEquals("2",js(a,"document.querySelectorAll('[data-balance-approval-entry]').length"));
   assertEquals("true",js(a,"!document.querySelector('[data-balance-approval-entry=cash-approval]') && document.querySelectorAll('nav button').length===4"));
   click(a,"[data-balance-approval=approval-2]");
   waitJs(a,"!!document.getElementById('balance-approval-detail')");
   assertEquals("true",js(a,"document.getElementById('balance-approval-detail').textContent.includes('Kayıtlarla güncel')"));
   assertEquals("true",js(a,"!document.getElementById('balance-approval-detail').textContent.includes('sentetik/kapanış')"));
   click(a,"#balance-history-reveal");
   assertEquals("true",js(a,"""
    (()=>{const text=document.getElementById('balance-approval-detail').textContent;
      return text.includes('sentetik/kapanış') && text.includes('sentetik/dönem') && text.includes('satır-1');
    })()
    """));
   assertEquals("true",js(a,"document.getElementById('balance-history-reveal').getAttribute('aria-pressed')==='true'"));
   a.onActivity(activity->web(activity).getSettings().setTextZoom(200));
   drawn(a);
   assertEquals("true",js(a,"document.documentElement.scrollWidth<=innerWidth"));
   a.onActivity(activity->web(activity).getSettings().setTextZoom(100));
   a.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
   a.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
   waitJs(a,"document.getElementById('balance-history-reveal')?.getAttribute('aria-pressed')==='false'");
   assertEquals("true",js(a,"!document.getElementById('balance-approval-detail').textContent.includes('sentetik/kapanış')"));
   assertEquals(snapshots,nativeSnapshots(context));
   device.pressBack();
   waitJs(a,"!!document.getElementById('balance-approval-history')");
   assertEquals("true",js(a,"!document.getElementById('balance-approval-history').textContent.includes('sentetik/kapanış')"));

   JSONObject changed=new JSONObject(original.toString());
   JSONArray transactions=changed.getJSONArray("transactions");
   JSONObject originalIncome=transactions.getJSONObject(0);
   transactions.remove(0);
   for(int amount:new int[]{40,60}){
    JSONObject movement=new JSONObject(originalIncome.toString());
    movement.put("id","replacement-income-"+amount).put("amount",amount);
    transactions.put(movement);
   }
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    database.execSQL("UPDATE snapshots SET content=? WHERE id=1",new Object[]{changed.toString()});
   }
   Map<Integer,String> staleSnapshots=nativeSnapshots(context);
   click(a,"#balance-history-refresh");
   click(a,"[data-balance-approval=approval-2]");
   waitJs(a,"document.getElementById('balance-approval-detail')?.textContent.includes('Yeniden inceleme gerekli')");
   assertEquals("true",js(a,"!!document.querySelector('[data-balance-reapprove=approval-2]')"));
   assertEquals(staleSnapshots,nativeSnapshots(context));
   click(a,"[data-balance-reapprove=approval-2]");
   waitJs(a,"!!document.getElementById('balance-anchor-form')");
   assertEquals("\"\"",js(a,"document.getElementById('f-balance-anchor').value"));
   assertEquals(staleSnapshots,nativeSnapshots(context));
   device.pressBack();
   waitJs(a,"!!document.getElementById('balance-approval-detail')");

   JSONArray observations=changed.getJSONObject("balanceReconciliation").getJSONArray("observations");
   for(int index=observations.length()-1;index>=0;index--){
    if("anchor".equals(observations.getJSONObject(index).getString("id")))observations.remove(index);
   }
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    database.execSQL("UPDATE snapshots SET content=? WHERE id=1",new Object[]{changed.toString()});
   }
   Map<Integer,String> missingAnchor=nativeSnapshots(context);
   click(a,"#balance-history-refresh");
   waitJs(a,"document.getElementById('balance-approval-detail')?.textContent.includes('Değerlendirilemiyor')");
   assertEquals("true",js(a,"document.getElementById('balance-approval-detail').textContent.includes('Bu onayın dayanağı güncel kayıtlarda bulunamıyor.')"));
   assertEquals("true",js(a,"!document.querySelector('[data-balance-reapprove]')"));
   click(a,"#balance-history-reveal");
   assertEquals("true",js(a,"""
    (()=>{const text=document.getElementById('balance-approval-detail').textContent;
      return text.includes('sentetik/kapanış') && text.includes('synthetic-income') && text.includes('satır-1');
    })()
    """));
   assertEquals(missingAnchor,nativeSnapshots(context));

   for(int index=observations.length()-1;index>=0;index--){
    if("observation".equals(observations.getJSONObject(index).getString("id")))observations.remove(index);
   }
   try(SQLiteDatabase database=context.openOrCreateDatabase("wallet.db",Context.MODE_PRIVATE,null)){
    database.execSQL("UPDATE snapshots SET content=? WHERE id=1",new Object[]{changed.toString()});
   }
   afterMissing=nativeSnapshots(context);
   click(a,"#balance-history-refresh");
   waitJs(a,"document.getElementById('balance-approval-detail')?.textContent.includes('Değerlendirilemiyor')");
   assertEquals("true",js(a,"document.getElementById('balance-approval-detail').textContent.includes('Bu onayın gözlemi güncel kayıtlarda bulunamıyor.')"));
   assertEquals("true",js(a,"!document.querySelector('[data-balance-reapprove]')"));
   assertEquals(afterMissing,nativeSnapshots(context));
   assertEquals(approvals,new JSONObject(afterMissing.get(1)).getJSONObject("balanceReconciliation").getJSONArray("approvals").toString());
  }
  try(ActivityScenario<MainActivity> reopened=ActivityScenario.launch(MainActivity.class)){
   waitJs(reopened,"!!document.querySelector('[data-stat=cardDebt]')");
   assertEquals(totals,js(reopened,"Array.from(document.querySelectorAll('[data-stat]'),e=>e.textContent)"));
   openNativeApprovalHistory(reopened,"cash");
   assertEquals("1",js(reopened,"document.querySelectorAll('[data-balance-approval-entry]').length"));
   click(reopened,"[data-balance-approval=cash-approval]");
   waitJs(reopened,"document.getElementById('balance-approval-detail')?.textContent.includes('Kayıtlarla güncel')");
   assertEquals(afterMissing,nativeSnapshots(context));
  }
 }

 private void assertMigratedWallet(ActivityScenario<MainActivity> a,JSONObject expected,boolean legacyBaseline)throws Exception{
  waitJs(a,"!!document.querySelector('[data-stat=cardDebt]')");
  AtomicReference<MainActivity.Bridge> bridge=new AtomicReference<>();
  a.onActivity(activity->bridge.set(activity.new Bridge()));
  JSONObject restored=new JSONObject(bridge.get().load());
  for(String key:new String[]{"accounts","transactions","statements","budgets","categories","merchantCategoryRules","incomePlans"}){
   assertEquals("Preserved "+key,expected.get(key).toString(),restored.get(key).toString());
  }
  // The released baseline still has its calendar field on Özet.
  if(legacyBaseline)setCalendarMonth(a,"2026-10");
  else selectSummaryMonth(a,"2026-10");
  assertEquals("true",js(a,"document.querySelector('[data-stat=netExpense]').textContent.includes('100,00')"));
  assertEquals("true",js(a,"document.querySelector('[data-stat=cardDebt]').textContent.includes('80,00')"));
 }

}
