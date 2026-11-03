import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const files=['web/app/danlm-adapter.js','web/app/core.js','web/app/card-counts.js','web/app/play-rules.js','web/app/series.js','web/app/tuo3.js','web/app/match.js','web/app/hand-assessment.js','web/app/private-hand-score.js','web/app/hand-assessment-legacy.js','web/app/assessment-legacy.js','web/app/assessment-rating-legacy.js','web/app/judge-v2.js','web/app/starting-reference.js','web/app/assessment-pilot.js','web/app/assessment.js','web/app/assessment-rating.js','web/app/assessment-standard.json','web/app/evaluation-protocol.js','web/assets/fairWorker-CTCwrT35.js','web/mobile/context.onnx','web/mobile/scores.onnx'];
const hashes=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const data={schema:1,webVersion:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,androidVersion:fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8').match(/versionName '([^']+)'/)[1],hashes,policy:'Official DanLM v1 inputs/actions/tribute; Apple Silicon native and aligned ONNX elsewhere; starting reference from earlier adapted policy',upstreamCommit:'d200e455f63fd46aa398e97b69a6bb94cf1ba098',alignment:'danlm-v1-official-alignment-1'};
fs.writeFileSync(path.join(root,'web/app/assessment-provenance.js'),"'use strict';\n(function(root){const data="+JSON.stringify(data)+";if(typeof module==='object'&&module.exports)module.exports=data;else root.GuandanAssessmentProvenance=data;})(globalThis);\n");
console.log('Recorded '+files.length+' rules/model/evaluation hashes.');
