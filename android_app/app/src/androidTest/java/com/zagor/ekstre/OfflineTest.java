package com.zagor.ekstre;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.*;
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import java.io.ByteArrayOutputStream;

@RunWith(AndroidJUnit4.class)
public class OfflineTest {
 private String js(ActivityScenario<MainActivity> activity,String code)throws Exception{
  CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
  activity.onActivity(a->{WebView web=(WebView)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);web.evaluateJavascript(code,v->{result.set(v);done.countDown();});});
  assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();
 }
 @Test public void opensOfflineAndRetainsWallet()throws Exception{
  try(ActivityScenario<MainActivity> a=ActivityScenario.launch(MainActivity.class)){
   String ready="";for(int i=0;i<40;i++){ready=js(a,"!!document.querySelector('[data-action=demo]')");if(ready.equals("true"))break;Thread.sleep(250);}assertEquals("true",ready);
   js(a,"document.querySelector('[data-action=demo]').click()");
   assertEquals("3",js(a,"JSON.parse(Android.load()).transactions.length"));
   a.recreate();String persisted="";for(int i=0;i<40;i++){persisted=js(a,"document.body.innerText.includes('Market alışverişi')");if(persisted.equals("true"))break;Thread.sleep(250);}assertEquals("true",persisted);
   assertEquals("false",js(a,"Android.save('{bad json')"));
   assertEquals("3",js(a,"JSON.parse(Android.load()).transactions.length"));
  }
 }
 @Test public void readsPdfTextOnAndroid()throws Exception{
  PDFBoxResourceLoader.init(InstrumentationRegistry.getInstrumentation().getTargetContext());
  byte[] bytes;
  try(PDDocument doc=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){
   PDPage page=new PDPage();doc.addPage(page);
   try(PDPageContentStream stream=new PDPageContentStream(doc,page)){stream.beginText();stream.setFont(PDType1Font.HELVETICA,12);stream.newLineAtOffset(30,700);stream.showText("QNB Hesap Kesim Tarihi: 05/10/2026");stream.endText();}
   doc.save(out);bytes=out.toByteArray();
  }
  try(PDDocument doc=PDDocument.load(bytes)){assertTrue(new PDFTextStripper().getText(doc).contains("QNB Hesap Kesim Tarihi"));}
 }
}
