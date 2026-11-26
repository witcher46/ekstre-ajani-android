package com.zagor.ekstre;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Objects;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Snapshot and transition validation for v4 expense allocations. */
final class ExpenseAllocationStorage {
 private static final long MAX_AMOUNT=1_000_000_000_000L;
 private static final String[] EXCLUDED={"statement","csvKey","csvSourceId","csvBatchId","importKey",
  "installment","installmentPlan","subscriptionId","subscriptionDue","target"};
 private static final String[] POSTED={"account","date","period","kind"};

 private ExpenseAllocationStorage() {}

 private static boolean empty(Object value){
  return value==null||value==JSONObject.NULL||"".equals(value);
 }

 private static boolean eligible(JSONObject row){
  if(row==null||!"expense".equals(row.opt("kind")))return false;
  Object source=row.opt("source"),status=row.opt("matchStatus");
  if((!empty(source)&&!"manual".equals(source))||"pending".equals(status)||"linked".equals(status)||
     !empty(row.opt("linkedTo"))||(row.has("currency")&&!"TRY".equals(row.opt("currency"))))return false;
  for(String key:EXCLUDED)if(!empty(row.opt(key)))return false;
  return true;
 }

 private static long amount(JSONObject row)throws JSONException{
  if(row.opt("amount") instanceof Number number){
   double value=number.doubleValue();
   if(value>0&&value<=MAX_AMOUNT&&Math.rint(value)==value)return (long)value;
  }
  throw new JSONException("Invalid expense allocation amount");
 }

 private record Transactions(HashMap<String,JSONObject> byId,HashSet<String> linkedTargets){
  static Transactions read(JSONObject wallet)throws JSONException{
   var rows=new HashMap<String,JSONObject>();
   var links=new HashSet<String>();
   JSONArray transactions=wallet.getJSONArray("transactions");
   for(int i=0;i<transactions.length();i++){
    JSONObject row=transactions.getJSONObject(i);
    if(!(row.opt("id") instanceof String id)||rows.putIfAbsent(id,row)!=null)throw new JSONException("Invalid transaction ID");
    if(row.opt("linkedTo") instanceof String target)links.add(target);
   }
   return new Transactions(rows,links);
  }

  boolean canAllocate(String id){
   return eligible(byId.get(id))&&!linkedTargets.contains(id);
  }
 }

 static boolean validSnapshot(JSONObject wallet)throws JSONException{
  JSONObject allocations=wallet.getJSONObject("expenseAllocations");
  if(allocations.length()==0)return true;
  Transactions transactions=Transactions.read(wallet);
  var categories=new HashSet<String>();
  JSONArray names=wallet.getJSONArray("categories");
  for(int i=0;i<names.length();i++)if(names.get(i) instanceof String name&&!name.isEmpty())categories.add(name);
  categories.remove("Toplam");
  var keys=allocations.keys();
  while(keys.hasNext()){
   String id=keys.next();
   if(!transactions.canAllocate(id))return false;
   JSONArray parts=allocations.getJSONArray(id);
   if(parts.length()<2||parts.length()>50000)return false;
   long remaining=amount(transactions.byId.get(id));
   for(int i=0;i<parts.length();i++){
    JSONObject part=parts.getJSONObject(i);
    if(part.length()!=2||!categories.contains(part.opt("category")))return false;
    remaining-=amount(part);
    if(remaining<0)return false;
   }
   if(remaining!=0)return false;
  }
  return true;
 }

 static boolean validWrite(JSONObject before,JSONObject after,boolean mayAppendApproval)throws JSONException{
  boolean wasV4=before!=null&&before.getDouble("version")==4;
  if(after.getDouble("version")!=4)return !wasV4;
  JSONObject next=after.getJSONObject("expenseAllocations");
  if(!wasV4&&(mayAppendApproval||next.length()==0||
      (before!=null&&(before.has("expenseAllocations")||
       (before.getDouble("version")==1&&before.has("balanceReconciliation"))))))return false;
  if(before==null)return true;
  var affected=new HashSet<String>();
  next.keys().forEachRemaining(affected::add);
  if(wasV4)before.getJSONObject("expenseAllocations").keys().forEachRemaining(affected::add);
  if(affected.isEmpty())return true;
  Transactions old=Transactions.read(before),updated=Transactions.read(after);
  for(String id:affected){
   JSONObject previous=old.byId.get(id),current=updated.byId.get(id);
   if(previous==null||current==null)continue;
   if(!old.canAllocate(id)||!updated.canAllocate(id)||amount(previous)!=amount(current))return false;
   for(String key:POSTED)if(!Objects.equals(previous.opt(key),current.opt(key)))return false;
  }
  return true;
 }
}
