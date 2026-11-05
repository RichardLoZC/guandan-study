#!/usr/bin/env python3
"""Derive black-paper, white-ink SVG cards from the existing minimal vectors.
Geometry, rank text, suit glyphs and big/small joker labels remain intact.
Only the heart level-card variants gain a visible white 配 label.
"""
from pathlib import Path
import hashlib,json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'web/assets/minimal';DEST=ROOT/'web/assets/mono'
NS='http://www.w3.org/2000/svg';ET.register_namespace('',NS)
manifest={}
for source in sorted(SOURCE.rglob('*.svg')):
    relative=source.relative_to(SOURCE);tree=ET.fromstring(source.read_text())
    for node in tree.iter():
        tag=node.tag.rsplit('}',1)[-1]
        if 'fill' in node.attrib and node.get('fill')!='none':node.set('fill','#000000' if tag in ('rect','circle') else '#ffffff')
        if 'stroke' in node.attrib and node.get('stroke')!='none':node.set('stroke','#ffffff')
    if relative.parts[0]=='level' and source.name.startswith('heart'):
        group=ET.SubElement(tree,'{'+NS+'}g',{'id':'mono-wild-label','aria-label':'Wild card'})
        ET.SubElement(group,'{'+NS+'}rect',{'x':'154','y':'10','width':'44','height':'40','rx':'5','fill':'#000000','stroke':'#ffffff','stroke-width':'2'})
        text=ET.SubElement(group,'{'+NS+'}text',{'x':'176','y':'40','text-anchor':'middle','font-size':'29','font-family':'PingFang SC, sans-serif','fill':'#ffffff'});text.text='配'
    data=ET.tostring(tree,encoding='utf-8',short_empty_elements=True)+b'\n';target=DEST/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    manifest[str(relative)]={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(data).hexdigest()}
assert len(manifest)==106
(ROOT/'web/card-sources/mono-night-source.json').write_text(json.dumps({'method':'code-native SVG palette derivation','source':'assets/minimal','output':'assets/mono','ink':'#ffffff','paper':'#000000','cards':manifest},ensure_ascii=False,indent=2)+'\n')
print('Generated',len(manifest),'black-paper SVG cards.')
