import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import{execFileSync}from'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
mkdirSync(root+'dist/emp001-preview',{recursive:true});
execFileSync(process.execPath,[require.resolve('esbuild/bin/esbuild'),root+'src/staging/emp001-config-preview.tsx','--bundle','--minify','--jsx=automatic','--format=iife','--platform=browser','--outfile='+root+'dist/emp001-preview/emp001-v1.js'],{stdio:'inherit'});
const css=readFileSync(root+'src/emp001-configuration.css','utf8');
writeFileSync(root+'dist/emp001-preview/emp001-v1.html',`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu vendedor · HerreB Workforce</title><style>${css}</style></head><body><div id="root"></div><script src="emp001-v1.js" defer></script><script src="emp001-assistant-launcher.js" defer></script></body></html>`);

execFileSync(process.execPath,[require.resolve('esbuild/bin/esbuild'),root+'src/staging/emp001-assistant-window.tsx','--bundle','--minify','--jsx=automatic','--format=iife','--platform=browser','--outfile='+root+'dist/emp001-preview/emp001-assistant.js'],{stdio:'inherit'});
writeFileSync(root+'dist/emp001-preview/emp001-assistant-launcher.js',readFileSync(root+'src/staging/emp001-assistant-launcher.js','utf8'));
writeFileSync(root+'dist/emp001-preview/emp001-assistant.html',`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Asistente · HerreB</title><style>${css}.assistant-window{padding:16px}.assistant-window .chatmessages{max-height:none}.assistant-window .proposal{margin-bottom:16px}</style></head><body><div id="root"></div><script src="emp001-assistant.js" defer></script></body></html>`);
