const config=JSON.parse(process.argv[2]);
if(config.phase2Variant.includes('compact')) (await import('./candidate-compact-maps.mjs')).enableCompactInstallers();
if(config.phase2Variant.includes('annotation')) (await import('./candidate-annotation.mjs')).enableAnnotation();
if(!['baseline','annotation','compact','compact-annotation'].includes(config.phase2Variant))throw new Error('Unknown phase2 variant');
await import('../bench/case.mjs');
