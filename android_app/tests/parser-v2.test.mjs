import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStatement} from '../app/src/main/assets/parser.mjs';

// Every bank row and amount in this file is synthetic.
const qnb=(body,headers='')=>`QNB\nHesap Kesim Tarihi: 05/10/2026\n${headers}\n${body}`;

test('QNB exact broken discount marker is a refund and retains its legacy identity',()=>{
 const p=parseStatement(qnb('01/10/2026 SENTETİK MAĞAZA PEN 4.ndirim 75.25'));
 assert.equal(p.rows[0].kind,'refund');
 assert.equal(p.rows[0].amount,7525);
 assert.equal(p.rows[0].sourceDesc,'SENTETİK MAĞAZA PEN 4.ndirim');
 assert.equal(p.rows[0].desc,'SENTETİK MAĞAZA PEŞİN İndirim');
 assert.equal(p.rows[0].importKey,'["QNB","2026-10","2026-10-01","SENTETIK MAGAZA PEN 4.ndirim",7525,""]|1');
});

test('CID payment and peşin markers are cleaned only for display',()=>{
 const p=parseStatement(qnb('01/10/2026 (cid:7)deme - Tesekkr Ederiz +90.00\n02/10/2026 SENTETİK MAĞAZA PE(cid:1)(cid:2)N 12.50 2/6'));
 assert.equal(p.rows[0].kind,'cardPayment');
 assert.equal(p.rows[0].desc,'Ödeme - Teşekkür Ederiz');
 assert.equal(p.rows[0].sourceDesc,'(cid:7)deme - Tesekkr Ederiz');
 assert.equal(p.rows[1].desc,'SENTETİK MAĞAZA PEŞİN');
 assert.equal(p.rows[1].sourceDesc,'SENTETİK MAĞAZA PE(cid:1)(cid:2)N');
 assert.equal(p.rows[1].installment,'2/6');
});

test('known missing Turkish glyphs in payment labels remain payments',()=>{
 const p=parseStatement(qnb('01/10/2026 deme - Tesekkr Ederiz 30.00'));
 assert.equal(p.rows[0].kind,'cardPayment');
 assert.equal(p.rows[0].desc,'Ödeme - Teşekkür Ederiz');
 assert.equal(p.rows[0].sourceDesc,'deme - Tesekkr Ederiz');
});

test('whole refund labels and signed credits reduce debt without guessing merchant substrings',()=>{
 const p=parseStatement(qnb('01/10/2026 SENTETİK MAĞAZA İADE 10.00\n01/10/2026 SENTETİK İPTAL 11.00\n01/10/2026 SENTETİK İNDİRİM 12.00\n01/10/2026 SENTETİK MAĞAZA -13.00\n01/10/2026 SENTETİK MAĞAZA +14.00\n01/10/2026 SENTETİK İNDİRİMCİ 15.00\n01/10/2026 SENTETİK IADEKIRTASIYE 16.00\n01/10/2026 TESEKKUR KAFE 17.00\n01/10/2026 SENTETİK PEN 18.00'));
 assert.deepEqual(p.rows.map(r=>r.kind),['refund','refund','refund','refund','refund','expense','expense','expense','expense']);
 assert.equal(p.rows.at(-1).desc,'SENTETİK PEN');
});

test('QNB reconciliation separates expenses, payments and refunds in cents',()=>{
 const p=parseStatement(qnb('01/10/2026 SENTETİK MARKET 80.00\n02/10/2026 ÖDEME INTERNET +30.00\n03/10/2026 SENTETİK MAĞAZA İADE 5.00','Önceki Dönem Borcu (TL): 100.00\nBu Dönem Borcu TL: 145.00\nSon Ödeme Tarihi: 15/10/2026'));
 assert.deepEqual(p.reconciliation,{status:'verified',previousDebt:10000,statementDebt:14500,expectedDebt:14500,difference:0,missing:[],totals:{expenses:8000,payments:3000,refunds:500},reasons:[]});
 assert.equal(p.debt,14500);
 assert.equal(p.due,'2026-10-15');
 assert.equal(p.warning,'');
});

test('Yapı Kredi numeric row dates and explicit statement header variants reconcile',()=>{
 const p=parseStatement('YAPI VE KREDİ\nHesap Özeti Tarihi : 05.10.2026\nSon Ödeme Tarihi : 15.10.2026\nÖnceki Hesap Özeti Borcu (TL): 0,00\nHesap Özeti Borcu (TL): 42,50\n01.10.2026 SENTETİK MAĞAZA 2/6 42,50 10');
 assert.equal(p.bank,'Yapı Kredi');
 assert.equal(p.cut,'2026-10-05');
 assert.equal(p.due,'2026-10-15');
 assert.equal(p.rows[0].installment,'2/6');
 assert.equal(p.rows[0].desc,'SENTETİK MAĞAZA');
 assert.equal(p.rows[0].sourceDesc,'SENTETİK MAĞAZA 2/6');
 assert.equal(p.reconciliation.status,'verified');
 assert.equal(p.reconciliation.expectedDebt,4250);
});

test('missing debt headers identify precisely why reconciliation is unverified',()=>{
 for(const [headers,missing,reason] of [
  ['Dönem Borcu: 20.00',['previousDebt'],/Önceki.*bulunamadı/],
  ['Önceki Dönem Hesap Özeti Borcu: 0.00',['statementDebt'],/Dönem borcu.*bulunamadı/],
  ['Önceki Dönem Hesap Özeti Borcu: okunamıyor\nDönem Borcu: 20.00',['previousDebt'],/Önceki.*okunamadı/],
  ['', ['previousDebt','statementDebt'],/Önceki/]
 ]){
  const p=parseStatement(qnb('01/10/2026 SENTETİK MARKET 20.00',headers));
  assert.equal(p.reconciliation.status,'unverified');
  assert.deepEqual(p.reconciliation.missing,missing);
  assert.equal(p.reconciliation.difference,null);
  assert.ok(p.reconciliation.reasons.some(s=>reason.test(s)));
  assert.match(p.warning,/doğrulanamadı/);
 }
});

test('a missing due date is explained without invalidating a verified debt calculation',()=>{
 const p=parseStatement(qnb('01/10/2026 SENTETİK MARKET 20.00','Önceki Dönem Hesap Özeti Borcu: 0.00\nDönem Borcu: 20.00'));
 assert.equal(p.reconciliation.status,'verified');
 assert.deepEqual(p.reconciliation.missing,[]);
 assert.equal(p.due,null);
 assert.ok(p.reconciliation.reasons.some(s=>/Son ödeme tarihi.*bulunamadı/.test(s)));
});

test('a zero previous balance is known and a contradictory total is a mismatch preview',()=>{
 const p=parseStatement(qnb('01/10/2026 SENTETİK MARKET 20.00','Önceki Dönem Hesap Özeti Borcu: 0.00\nDönem Borcu: 21.00'));
 assert.equal(p.reconciliation.status,'mismatch');
 assert.equal(p.reconciliation.previousDebt,0);
 assert.equal(p.reconciliation.statementDebt,2100);
 assert.equal(p.reconciliation.expectedDebt,2000);
 assert.equal(p.reconciliation.difference,100);
 assert.deepEqual(p.reconciliation.missing,[]);
 assert.match(p.warning,/uyuşmuyor/);
 assert.ok(p.reconciliation.reasons.some(s=>/uyuşmuyor/.test(s)));
 assert.equal(p.rows.length,1);
});

test('raw Unicode description and occurrence suffix preserve the original import keys',()=>{
 const p=parseStatement(qnb('01/10/2026 ŞENTETİK ÇİÇEK PE(cid:1)N 13.50\n01/10/2026 ŞENTETİK ÇİÇEK PE(cid:1)N 13.50'));
 assert.deepEqual(p.rows.map(r=>r.importKey),[
  '["QNB","2026-10","2026-10-01","SENTETIK CICEK PESIN",1350,""]|1',
  '["QNB","2026-10","2026-10-01","SENTETIK CICEK PESIN",1350,""]|2'
 ]);
 assert.equal(p.rows[0].sourceDesc,'ŞENTETİK ÇİÇEK PE(cid:1)N');
 assert.equal(p.rows[0].desc,'ŞENTETİK ÇİÇEK PEŞİN');
});

test('malformed dated rows reject the whole statement instead of disappearing or rounding',()=>{
 for(const row of ['02/10/2026','02/10/2026 SENTETİK 12.345','02/10/2026 SENTETİK 12.3','30/02/2026 SENTETİK 10.00']){
  assert.throws(()=>parseStatement(qnb(`01/10/2026 SENTETİK MARKET 20.00\n${row}`)),/kısmi kayıt yapılmadı/);
 }
});

test('wrapped raw bank descriptions retain their original text',()=>{
 const p=parseStatement(qnb('01/10/2026 SENTETİK ÇİÇEK\nŞUBE PE(cid:1)N 13.50'));
 assert.equal(p.rows[0].sourceDesc,'SENTETİK ÇİÇEK\nŞUBE PE(cid:1)N');
 assert.equal(p.rows[0].desc,'SENTETİK ÇİÇEK ŞUBE PEŞİN');
 assert.equal(p.rows[0].importKey,'["QNB","2026-10","2026-10-01","SENTETIK CICEK SUBE PESIN",1350,""]|1');
});
