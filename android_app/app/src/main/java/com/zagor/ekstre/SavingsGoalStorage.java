package com.zagor.ekstre;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Native snapshot validation for manual savings goals introduced in v5. */
final class SavingsGoalStorage {
 private static final long MAX_AMOUNT=1_000_000_000_000L;
 // Match the whitespace removed by JavaScript String.trim().
 private static final Pattern NAME_CONTENT=Pattern.compile(
  "[^\\x{0009}-\\x{000D} \\x{00A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}]");

 private SavingsGoalStorage() {}

 static boolean validSnapshot(JSONObject wallet)throws JSONException {
  JSONArray goals=wallet.getJSONArray("savingsGoals"),accounts=wallet.getJSONArray("accounts");
  if(goals.length()>50000||accounts.length()>50000)return false;
  var eligible=new HashSet<String>();
  for(int i=0;i<accounts.length();i++){
   JSONObject account=accounts.getJSONObject(i);
   Object type=account.opt("type");
   if(account.opt("id") instanceof String id&&("bank".equals(type)||"cash".equals(type)))eligible.add(id);
  }
  var ids=new HashSet<String>();
  for(int i=0;i<goals.length();i++){
   JSONObject goal=goals.getJSONObject(i);
   if(!(goal.opt("id") instanceof String id)||!id.matches("[A-Za-z0-9_-]{1,200}")||!ids.add(id)||
      !(goal.opt("name") instanceof String name)||name.length()>200||!NAME_CONTENT.matcher(name).find()||
      !(goal.opt("account") instanceof String account)||!eligible.contains(account)||
      !(goal.opt("due") instanceof String date)||!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||
      !LocalDate.parse(date).toString().equals(date)||
      !cents(goal.opt("target"),1)||!cents(goal.opt("reserved"),0))return false;
  }
  return true;
 }

 private static boolean cents(Object value,int minimum){
  if(!(value instanceof Number number))return false;
  double amount=number.doubleValue();
  return amount>=minimum&&amount<=MAX_AMOUNT&&amount==Math.rint(amount);
 }

 static boolean validWrite(JSONObject before,JSONObject after,boolean mayAppendApproval)throws JSONException {
  double current=before==null?0:before.getDouble("version");
  double next=after.getDouble("version");
  if(current>=5)return current==5&&next==5;
  if(next<5)return true;
  return !mayAppendApproval&&(before==null||!before.has("savingsGoals"))&&
   after.getJSONArray("savingsGoals").length()>0;
 }
}
