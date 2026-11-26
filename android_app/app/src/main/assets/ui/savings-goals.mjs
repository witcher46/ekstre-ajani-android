import * as C from '../core.mjs';
import {escapeHtml as esc,field,options,select} from './form-controls.mjs';
import {renderBackLink} from './navigation.mjs';

const dateLabel=new Intl.DateTimeFormat('tr-TR',{dateStyle:'long',timeZone:'UTC'});

export function savingsGoalFields(state,goal){
 const accounts=state.accounts.filter(C.isSavingsAccount).map(account=>[account.id,account.name]);
 return (state.version<5?'<p class="notice">İlk hedef kaydedildiğinde yedek biçimi v5 olur. Eski Android sürümleri bu yedeği açamaz.</p>':'')+
  field('goal-name','Hedef adı',goal?.name??'','text','required maxlength="200"')+
  select('goal-account','Banka veya nakit hesabı',options(accounts,goal?.account))+
  field('goal-target','Hedef tutarı (TL)',goal?C.decimalMoney(goal.target):'','text','inputmode="decimal" required')+
  field('goal-due','Hedef tarihi',goal?.due??'','date','required max="9999-12-31"')+
  field('goal-reserved','Ayırdığım tutar (TL)',goal?C.decimalMoney(goal.reserved):'0','text','inputmode="decimal" required')+
  (goal?'<div class="actions"><button type="button" class="danger" data-action="removeSavingsGoal" data-goal-id="'+esc(goal.id)+'">Hedefi sil</button></div>':'');
}

export function renderSavingsGoals({state,backTitle,fmt}){
 const goals=C.savingsGoals(state);
 const accounts=new Map(state.accounts.filter(C.isSavingsAccount).map(account=>[account.id,account]));
 const warnings=C.savingsGoalWarnings(state).map(({account,reserved,excess})=>
  `<p class="warning panel" role="alert"><strong>${esc(account.name)} hesabında fazla ayırma</strong><br>
  Toplam ayrılan ${fmt(reserved)}. Kullanılabilir bakiyeyi ${fmt(excess)} aşıyor.</p>`).join('');
 return `<div class="wallet-v2">
  ${renderBackLink(backTitle)}
  <h1>Birikim hedefleri</h1>
  <p class="lead">Ayırdığın tutarı burada takip edebilirsin. Bu kayıt hesap bakiyesini değiştirmez.</p>
  ${accounts.size?'<button type="button" class="primary" data-action="addSavingsGoal" aria-haspopup="dialog" aria-controls="modal">Hedef ekle</button>':
    '<p>Birikim hedefi oluşturmak için bir banka veya nakit hesabı ekle.</p><button type="button" data-action="addAccount">Hesap ekle</button>'}
  ${warnings}
  ${goals.map(goal=>{
   const progress=`${C.formatMoney(goal.reserved)} / ${C.formatMoney(goal.target)}`;
   return `<section class="panel">
    <h2>${esc(goal.name)}</h2>
    <p>${esc(accounts.get(goal.account).name)} · Vade <time datetime="${esc(goal.due)}">${esc(dateLabel.format(new Date(goal.due)))}</time></p>
    <p>Ayrılan ${fmt(goal.reserved)} / Hedef ${fmt(goal.target)}</p>
    <progress class="bar" aria-label="${esc(goal.name+' birikim ilerlemesi')}" aria-valuetext="${esc(progress)}" max="${goal.target}" value="${Math.min(goal.reserved,goal.target)}"></progress>
    <button type="button" id="goal-${esc(goal.id)}" data-action="editSavingsGoal" aria-haspopup="dialog" aria-controls="modal" data-goal-id="${esc(goal.id)}" aria-label="${esc(goal.name+' hedefini düzenle')}">Düzenle</button>
   </section>`;
  }).join('')||'<p>Henüz birikim hedefi yok.</p>'}
 </div>`;
}
