// The HMAC key lives in the local WebView/browser database and never in wallet JSON.
let deviceKey;

export function loadPdfIdentityKey(){
 if(!deviceKey)deviceKey=openIdentityKey().catch(error=>{deviceKey=undefined;throw error;});
 return deviceKey;
}

async function openIdentityKey(){
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('ekstre-pdf-identity',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('keys');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 try{
  const stored=await new Promise((resolve,reject)=>{
   const request=db.transaction('keys').objectStore('keys').get('statement');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  if(stored)return stored;
  const candidate={id:crypto.randomUUID(),secret:await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'},false,['sign'])};
  return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('keys','readwrite');
   const store=transaction.objectStore('keys');
   const request=store.get('statement');
   let value;
   request.onsuccess=()=>{
    value=request.result??candidate;
    if(!request.result)store.add(candidate,'statement');
   };
   transaction.oncomplete=()=>resolve(value);
   transaction.onabort=()=>reject(transaction.error);
  });
 }finally{db.close();}
}

export async function signPdfIdentity(key,identity){
 const mac=await crypto.subtle.sign('HMAC',key.secret,new TextEncoder().encode(JSON.stringify(identity)));
 return 'pdf-hmac-v1:'+key.id+':'+Array.from(new Uint8Array(mac),byte=>byte.toString(16).padStart(2,'0')).join('');
}
