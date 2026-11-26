import {test} from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml,options,field,select} from '../app/src/main/assets/ui/form-controls.mjs';
import {NAV_ITEMS,activeBottomPage,renderBottomNavigation} from '../app/src/main/assets/ui/navigation.mjs';

test('form controls escape user-controlled values without changing existing markup',()=>{
  assert.equal(escapeHtml(`<a title="x">O'Connor & Co.</a>`),
    '&lt;a title=&quot;x&quot;&gt;O&#39;Connor &amp; Co.&lt;/a&gt;');
  assert.equal(escapeHtml(null),'');
  assert.equal(options([['A&B','<B>'],['a','Seçenek']],'A&B'),
    '<option value="A&amp;B" selected>&lt;B&gt;</option><option value="a" >Seçenek</option>');
  assert.equal(field('note','Not','<script>alert("x")</script>','text','maxlength="200"'),
    '<label for="f-note">Not</label><input id="f-note" name="note" type="text" value="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;" maxlength="200">');
  assert.equal(select('account','Hesap','<option value="x" >Test</option>'),
    '<label for="f-account">Hesap</label><select id="f-account" name="account"><option value="x" >Test</option></select>');
});

test('plain-text form labels cannot inject markup into a dialog',()=>{
  const label='<b data-action="demo">Sentetik & Kart</b>';
  const escaped='&lt;b data-action=&quot;demo&quot;&gt;Sentetik &amp; Kart&lt;/b&gt;';
  assert.equal(select('card-0',label,''),
    `<label for="f-card-0">${escaped}</label><select id="f-card-0" name="card-0"></select>`);
  assert.equal(field('name',label),
    `<label for="f-name">${escaped}</label><input id="f-name" name="name" type="text" value="" >`);
});

test('bottom navigation exposes three fixed routes and a dialog action',()=>{
  assert.deepEqual(NAV_ITEMS.map(([id])=>id),['home','wallet','reports']);
  const html=renderBottomNavigation('home');
  assert.deepEqual([...html.matchAll(/data-page="([^"]+)"/g)].map(match=>match[1]),['home','wallet','reports']);
  assert.match(html,/id="more" data-action="openMore" aria-haspopup="dialog" aria-controls="modal"/);
});

test('wallet subpages and fixed routes have one current tab',()=>{
  for(const [page,parent] of [['home','home'],['account','wallet'],['balanceReview','wallet'],
    ['balanceApprovalHistory','wallet'],['balanceApprovalDetail','wallet'],['reports','reports']]){
    assert.equal(activeBottomPage(page),parent);
    const html=renderBottomNavigation(page);
    assert.match(html,new RegExp('data-page="'+parent+'" aria-current="page"'));
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  }
  for(const page of ['plan','incomePlans','import','statement','transactions','review','settings','categories']){
    assert.doesNotMatch(renderBottomNavigation(page),/aria-current/);
  }
});
