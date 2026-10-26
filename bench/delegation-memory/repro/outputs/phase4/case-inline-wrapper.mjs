const c=JSON.parse(process.argv[2]);
if(c.phase4Variant==='inline-composite')(await import('./candidate-inline-composite.mjs')).enableInlineComposite();
await import('../phase2/case-wrapper.mjs');
