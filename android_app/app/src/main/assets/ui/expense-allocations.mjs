import {field,options,select} from './form-controls.mjs';

export const expenseAllocationFields=upgrading=>`<div id="expense-allocation" class="expense-allocation">
 <button id="start-expense-allocation" type="button" hidden>Gideri böl</button>
 <fieldset id="expense-allocation-parts" aria-describedby="expense-allocation-help" hidden disabled>
  <legend>Gider bölümleri</legend>
  <p id="expense-allocation-help">En az iki bölüm gir. Bölümlerin toplamı işlem tutarına eşit olmalı.</p>
  ${upgrading?'<p>İlk bölümü kaydetmek cüzdanı v4 biçimine geçirir. Eski uygulama sürümleri v4 yedeklerini açamaz.</p>':''}
  <div id="expense-allocation-rows"></div>
  <div class="expense-allocation-actions">
   <button id="add-expense-allocation" type="button">Bölüm ekle</button>
   <button id="clear-expense-allocation" type="button">Bölümleri kaldır</button>
  </div>
 </fieldset>
</div>`;

export function attachExpenseAllocationFields(root,categories,initial,{parseAmount,formatAmount,onChange}){
 const start=root.querySelector('#start-expense-allocation');
 const parts=root.querySelector('#expense-allocation-parts');
 const rows=root.querySelector('#expense-allocation-rows');
 const choices=[['','Kategori seç'],...categories.filter(name=>name!=='Toplam').map(name=>[name,name])];
 let serial=0,available=false,cleared=false;

 function refresh(){
  const active=available&&rows.childElementCount>0;
  parts.hidden=parts.disabled=!active;
  start.hidden=!available||active;
  for(const button of rows.querySelectorAll('[data-remove-allocation]'))button.hidden=rows.children.length<=2;
 }
 function add(part){
  const key=++serial;
  const row=root.ownerDocument.createElement('div');
  row.className='expense-allocation-row';
  row.dataset.part=key;
  row.innerHTML=select('allocation-category-'+key,'Bölüm '+key+' kategorisi',options(choices,part?.category??''))+
   field('allocation-amount-'+key,'Bölüm '+key+' tutarı (TL)',part?formatAmount(part.amount):'','text','inputmode="decimal" required')+
   `<button type="button" data-remove-allocation="${key}">Bölüm ${key} satırını kaldır</button>`;
  rows.append(row);
  const category=row.querySelector('select');
  category.required=true;
  row.querySelector('button').onclick=()=>{
   const destination=row.nextElementSibling??row.previousElementSibling;
   row.remove();
   refresh();
   destination.querySelector('select').focus();
  };
  return category;
 }
 function open(values){
  for(const part of values)add(part);
  cleared=false;
  refresh();
 }
 if(initial)open(initial);
 start.onclick=()=>{
  serial=0;
  open([null,null]);
  onChange();
  rows.querySelector('select').focus();
 };
 root.querySelector('#add-expense-allocation').onclick=()=>add().focus();
 root.querySelector('#clear-expense-allocation').onclick=()=>{
  rows.replaceChildren();
  cleared=!!initial;
  refresh();
  onChange();
  (start.hidden?root.ownerDocument.querySelector('#f-kind'):start).focus();
 };

 return {
  active:()=>!parts.hidden,
  setAvailable(value){available=value;refresh();},
  read(form){
   if(parts.hidden)return cleared?null:undefined;
   return Array.from(rows.children,({dataset:{part}})=>({
    category:form.get('allocation-category-'+part),
    amount:parseAmount(form.get('allocation-amount-'+part)),
   }));
  },
 };
}
