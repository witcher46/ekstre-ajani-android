if (typeof window.structuredClone === 'function') {
 const app = document.createElement('script');
 app.type = 'module';
 app.src = './app.mjs';
 document.head.append(app);
}
