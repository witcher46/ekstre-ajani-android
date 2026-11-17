package com.zagor.ekstre;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Validation of historical proof, independent of the wallet's current ledger. */
final class BalanceApprovalStorage {
 private static final DateTimeFormatter TIMESTAMP = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
 private static final BigInteger SAFE_AMOUNT = BigInteger.valueOf(9007199254740991L);
 private static final String JS_WHITESPACE = "[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";
 private static final char[] HEX = "0123456789abcdef".toCharArray();

 private BalanceApprovalStorage() {}

 static String sha256(String content) {
  byte[] hash;
  try {
   hash = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
  } catch (NoSuchAlgorithmException e) {
   throw new IllegalStateException(e);
  }
  char[] hex = new char[hash.length * 2];
  for (int i = 0; i < hash.length; i++) {
   hex[2*i] = HEX[(hash[i] & 0xff) >>> 4];
   hex[2*i+1] = HEX[hash[i] & 15];
  }
  return new String(hex);
 }

 static boolean preservesHistory(JSONObject current, JSONObject next, boolean mayAppend) throws JSONException {
  boolean nextIsV3 = next.getDouble("version") == 3;
  if (current == null || current.getDouble("version") != 3) {
   if (!nextIsV3) return true;
   JSONObject oldSection = current == null ? null : current.optJSONObject("balanceReconciliation");
   return mayAppend && (oldSection == null || !oldSection.has("approvals"));
  }
  if (!nextIsV3) return false;
  JSONArray before = current.getJSONObject("balanceReconciliation").getJSONArray("approvals");
  JSONArray after = next.getJSONObject("balanceReconciliation").getJSONArray("approvals");
  if (after.length() < before.length() || (!mayAppend && after.length() != before.length())) return false;
  for (int i = 0; i < before.length(); i++) {
   JSONObject oldApproval = before.getJSONObject(i), newApproval = after.getJSONObject(i);
   for (String key : new String[]{"id","approvedAt","previousApprovalId","evidenceJson","evidenceSha256"}) {
    if (!oldApproval.get(key).equals(newApproval.get(key))) return false;
   }
  }
  return true;
 } static boolean validApprovals(JSONArray approvals) throws JSONException {
  if (approvals.length() > 50000) return false;
  var ids = new HashSet<String>();
  var latest = new HashMap<List<String>, JSONObject>();
  for (int i = 0; i < approvals.length(); i++) {
   JSONObject approval = approvals.getJSONObject(i);
   if (approval.length() != 5 || !id(approval.opt("id")) ||
       !ids.add(approval.getString("id")) || !timestamp(approval.opt("approvedAt"))) return false;
   if (!(approval.opt("evidenceJson") instanceof String raw) ||
       !(approval.opt("evidenceSha256") instanceof String digest) || !sha256(raw).equals(digest)) return false;
   var evidence = new JSONObject(raw);
   if (!validEvidence(evidence) || !isCanonical(evidence, raw)) return false;
   var key = Arrays.asList(evidence.getString("accountId"), evidence.getJSONObject("observation").getString("id"));
   JSONObject prior = latest.get(key);
   Object expected = prior == null ? JSONObject.NULL : prior.getString("id");
   if (!expected.equals(approval.get("previousApprovalId")) ||
       (prior != null && approval.getString("approvedAt").compareTo(prior.getString("approvedAt")) < 0)) return false;
   latest.put(key, approval);
  }
  return true;
 }

 private static boolean validEvidence(JSONObject e) throws JSONException {
  if (!fields(e,"version policy accountId accountType anchor observation interval calculatedCents differenceCents coverage movements") ||
      !(e.get("version") instanceof Number version) || version.doubleValue() != 1 ||
      !"cash-end-of-day-v1".equals(e.get("policy")) || !walletId(e.get("accountId"))) return false;
  boolean bank = "bank".equals(e.get("accountType"));
  if (!bank && !"cash".equals(e.get("accountType"))) return false;
  JSONObject anchor = e.getJSONObject("anchor"), observation = e.getJSONObject("observation"), interval = e.getJSONObject("interval");
  if (!point(anchor,bank,true) || !point(observation,bank,false) || anchor.get("id").equals(observation.get("id")) ||
      anchor.getString("date").compareTo(observation.getString("date")) >= 0 ||
      !fields(interval,"fromExclusive throughInclusive boundary timeZone") ||
      !anchor.get("date").equals(interval.get("fromExclusive")) || !observation.get("date").equals(interval.get("throughInclusive")) ||
      !"end-of-day".equals(interval.get("boundary")) ||
      !supportedZone(interval.get("timeZone")) ||
      !cents(e.get("calculatedCents"),false) || !cents(e.get("differenceCents"),false)) return false;
  JSONObject coverage = e.getJSONObject("coverage");
  if (!fields(coverage,"status sourceKind sourceRef matches") || !"source-supported".equals(coverage.get("status")) ||
      !(bank ? "bankStatement" : "cashJournal").equals(coverage.get("sourceKind")) || !reference(coverage.get("sourceRef"))) return false;
  JSONArray matches = coverage.getJSONArray("matches"), movements = e.getJSONArray("movements");
  if (movements.length() > 50000 || matches.length() > movements.length()) return false;
  var sourceIds = new HashSet<String>();
  String lastId = null;
  int matched = 0;
  BigInteger total = amount(anchor,"amountCents");
  for (int i = 0; i < movements.length(); i++) {
   JSONObject row = movements.getJSONObject(i);
   if (!movement(row) || !validHistoricalEffect(row,e,interval)) return false;
   String rowId = row.getString("id");
   if (lastId != null && lastId.compareTo(rowId) >= 0) return false;
   lastId = rowId;
   if (row.getBoolean("included")) {
    JSONObject match = matches.getJSONObject(matched++);
    if (!fields(match,"id sourceRowId") || !rowId.equals(match.get("id")) ||
        !reference(match.get("sourceRowId")) || !sourceIds.add(match.getString("sourceRowId"))) return false;
    total = total.add(amount(row,"effectCents"));
   }
  }
  return matched == matches.length() && total.equals(amount(e,"calculatedCents")) &&
   amount(observation,"amountCents").subtract(total).equals(amount(e,"differenceCents"));
 }

 private static boolean supportedZone(Object value) {
  if (!(value instanceof String zone) || zone.length() > 200 || !zone.matches("[A-Za-z][A-Za-z0-9_+/-]*")) return false;
  boolean[] systemId = new boolean[1];
  android.icu.util.TimeZone.getCanonicalID(zone,systemId);
  if (systemId[0]) return true;
  for (String known : android.icu.util.TimeZone.getAvailableIDs()) {
   if (known.equalsIgnoreCase(zone)) return true;
  }
  return false;
 } private static boolean validHistoricalEffect(JSONObject row, JSONObject evidence, JSONObject interval) throws JSONException {
  String account = evidence.getString("accountId"), date = row.getString("date");
  boolean debitOrCredit = account.equals(row.get("accountId")), receiving = account.equals(row.get("targetId"));
  boolean included = (debitOrCredit || receiving) && row.isNull("linkedTo") &&
   interval.getString("fromExclusive").compareTo(date) < 0 && date.compareTo(interval.getString("throughInclusive")) <= 0;
  if (row.getBoolean("included") != included) return false;
  if (!included) return true;
  BigInteger amount = amount(row,"amountCents");
  BigInteger effect = debitOrCredit ? (oneOf(row.get("kind"),"income","refund") ? amount : amount.negate()) : BigInteger.ZERO;
  return amount(row,"effectCents").equals(receiving ? effect.add(amount) : effect);
 }
 private static boolean point(JSONObject row, boolean bank, boolean anchor) throws JSONException {
  return fields(row,"id date amountCents sourceKind" + (anchor ? " sourceType sourceRef" : "")) &&
   id(row.get("id")) && date(row.get("date")) && cents(row.get("amountCents"),true) &&
   (bank ? oneOf(row.get("sourceKind"),"bankDocument","manualBank") : "cashCount".equals(row.get("sourceKind"))) &&
   (!anchor || ((bank ? "bankClosingRecord" : "cashCountRecord").equals(row.get("sourceType")) && reference(row.get("sourceRef"))));
 }

 private static boolean movement(JSONObject row) throws JSONException {
  if (!fields(row,"id date kind accountId targetId amountCents source included effectCents matchStatus linkedTo previousLinkedTo matchCandidates")) return false;
  return walletId(row.get("id")) && date(row.get("date")) &&
   oneOf(row.get("kind"),"expense","income","refund","cardPayment","payment","transfer") &&
   walletId(row.get("accountId")) && nullableId(row.get("targetId")) &&
   cents(row.get("amountCents"),true) && !row.getString("amountCents").startsWith("-") &&
   oneOf(row.get("source"),"manual","pdf","csv","unknown") &&
   row.get("included") instanceof Boolean included &&
   (included ? cents(row.get("effectCents"),true) : row.isNull("effectCents")) &&
   (row.isNull("matchStatus") || oneOf(row.get("matchStatus"),"linked","distinct")) &&
   nullableId(row.get("linkedTo")) && row.isNull("previousLinkedTo") && row.getJSONArray("matchCandidates").length() == 0;
 }

 private static boolean fields(JSONObject object, String names) {
  Iterator<String> keys = object.keys();
  for (String name : names.split(" ")) if (!keys.hasNext() || !name.equals(keys.next())) return false;
  return !keys.hasNext();
 }
 private static boolean oneOf(Object value, String... values) {
  for (String known : values) if (known.equals(value)) return true;
  return false;
 }
 private static boolean id(Object value) {
  return value instanceof String s && s.matches("[A-Za-z0-9_-]{1,200}");
 }
 private static boolean walletId(Object value) {
  return value instanceof String s && s.length() <= 200;
 }
 private static boolean nullableId(Object value) {
  return value == JSONObject.NULL || walletId(value);
 }
 private static boolean reference(Object value) {
  return value instanceof String s && !s.isEmpty() && s.length() <= 200 &&
   !s.substring(0,1).matches(JS_WHITESPACE) && !s.substring(s.length()-1).matches(JS_WHITESPACE);
 }
 private static boolean cents(Object value, boolean safe) {
  return value instanceof String s && s.matches("(?:0|-?[1-9][0-9]{0,17})") &&
   (!safe || new BigInteger(s).abs().compareTo(SAFE_AMOUNT) <= 0);
 }
 private static BigInteger amount(JSONObject row, String key) throws JSONException {
  return new BigInteger(row.getString(key));
 }
 private static boolean timestamp(Object value) {
  return value instanceof String s && s.length() == 24 && TIMESTAMP.format(Instant.parse(s)).equals(s);
 }
 private static boolean date(Object value) {
  return value instanceof String s && s.length() == 10 && LocalDate.parse(s).toString().equals(s);
 }

 // Evidence version 1 uses JSON.stringify's UTF-16 string escapes and field order.
 private static boolean isCanonical(JSONObject evidence, String raw) throws JSONException {
  StringBuilder canonical = new StringBuilder(raw.length());
  appendJson(canonical,evidence);
  return raw.contentEquals(canonical);
 }

 private static void appendJson(StringBuilder out, Object value) throws JSONException {
  if (value instanceof JSONObject object) {
   out.append('{');
   Iterator<String> keys = object.keys();
   while (keys.hasNext()) {
    String key = keys.next();
    appendString(out,key);
    out.append(':');
    appendJson(out,object.get(key));
    if (keys.hasNext()) out.append(',');
   }
   out.append('}');
  } else if (value instanceof JSONArray array) {
   out.append('[');
   for (int i = 0; i < array.length(); i++) {
    if (i != 0) out.append(',');
    appendJson(out,array.get(i));
   }
   out.append(']');
  } else if (value instanceof String text) appendString(out,text);
  else out.append(value);
 }

 private static void appendString(StringBuilder out, String text) {
  out.append('"');
  for (int i = 0; i < text.length(); i++) {
   char c = text.charAt(i);
   switch (c) {
    case '"' -> out.append("\\\"");
    case '\\' -> out.append("\\\\");
    case '\b' -> out.append("\\b");
    case '\f' -> out.append("\\f");
    case '\n' -> out.append("\\n");
    case '\r' -> out.append("\\r");
    case '\t' -> out.append("\\t");
    default -> {
     if (Character.isHighSurrogate(c) && i+1 < text.length() && Character.isLowSurrogate(text.charAt(i+1))) {
      out.append(c).append(text.charAt(++i));
     } else if (c < 0x20 || Character.isSurrogate(c)) {
      out.append("\\u").append(HEX[c>>>12]).append(HEX[(c>>>8)&15]).append(HEX[(c>>>4)&15]).append(HEX[c&15]);
     } else out.append(c);
    }
   }
  }
  out.append('"');
 }
}
