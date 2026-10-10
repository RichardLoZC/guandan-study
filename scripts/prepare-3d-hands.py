"""Bake CC0 anatomical hands into reproducible, lightweight holding poses.

Run with Blender --background --factory-startup --disable-autoexec --python.
Source, CC0 declaration and download hash are in
artwork/3d-research/anatomical-hand/SOURCE.json. No source scripts are executed.
The mesh contains anatomical finger pads and nails. Only the thumb opposes the
fan; the index supports the back and the remaining fingers support the fan from behind.
Runtime moves each whole hand, without stretching bones or changing game state.
"""
import bpy,bmesh,math
from mathutils import Vector,Matrix
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'artwork/3d-research/anatomical-hand/hand-posable.glb'))
source=next(o for o in bpy.context.scene.objects if o.type=='MESH');rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
# A left palm, wrist at the origin, fingers up, palm facing the viewer.
frame=Matrix(((1,0,0,-.032),(0,1,0,-.029),(0,0,-1,.045),(0,0,0,1)))
vertices=[frame @ source.matrix_world @ v.co for v in source.data.vertices]
heads={b.name:frame @ rig.matrix_world @ b.head_local for b in rig.data.bones}
groups={g.index:g.name for g in source.vertex_groups}
weights=[[(groups[g.group],g.weight) for g in v.groups] for v in source.data.vertices]
parents={b.name:b.parent.name if b.parent else None for b in rig.data.bones}
faces=[list(reversed(p.vertices[:])) for p in source.data.polygons]
# Canonical positions retained for inspection and repeatable anatomical posing.

for label in ['left','right']:
 rotations={}
 for name in heads:
  r=Matrix.Identity(4)
  if name.startswith(('index','middle','ring','pinky')):
   finger=name.split('_')[0];joint=int(name.split('_')[1]);angles={'index':[-35,12,10],'middle':[-38,7,6],'ring':[-35,9,8],'pinky':[-27,8,6]}
   r=Matrix.Rotation(math.radians(angles[finger][joint-1]),4,'X')
  if name.startswith('thumb'):
   joint=int(name.split('_')[1])
   if joint==1:r=Matrix.Rotation(math.radians(30),4,'Z') @ Matrix.Rotation(math.radians(65),4,(heads['thumb_03_r']-heads['thumb_01_r']).normalized())
   if joint==2:r=Matrix.Rotation(math.radians(-5),4,'Z')
   if joint==3:r=Matrix.Rotation(math.radians(-8),4,'Z')
  rotations[name]=r
 transforms={}
 def transform(name):
  if name in transforms:return transforms[name]
  parent=parents[name];point=heads[name]
  transforms[name]=(transform(parent) if parent else Matrix.Identity(4)) @ Matrix.Translation(point) @ rotations[name] @ Matrix.Translation(-point)
  return transforms[name]
 posed=[]
 for co,ws in zip(vertices,weights):
  total=sum(w for _,w in ws);v=sum((transform(n)@co*w for n,w in ws),Vector())/total if total else co.copy()
  if label=='right':v.x=-v.x
  # Thumb pads are broader than the fingertips of the supporting fingers.
  if label=='right':v.x=-v.x
  thumb_weight=sum(w for n,w in ws if n in ('thumb_02_r','thumb_03_r'))
  axis=(transform('thumb_03_r')@heads['thumb_03_r']-transform('thumb_02_r')@heads['thumb_02_r']).normalized()
  origin=transform('thumb_02_r')@heads['thumb_02_r'];radial=v-origin-axis*(v-origin).dot(axis)
  v+=radial*(.40*thumb_weight)-axis*((v-origin).dot(axis)*.14*thumb_weight)
  if label=='right':v.x=-v.x
  posed.append(v)
 data=bpy.data.meshes.new(label+' hand anatomy');data.from_pydata(posed,[],faces if label=='left' else [list(reversed(f)) for f in faces]);data.update()
 mesh=bpy.data.objects.new(label+' hand',data);bpy.context.collection.objects.link(mesh)
 # Build in screen coordinates then convert to Blender coordinates for glTF Y-up export.
 mesh.data.transform(Matrix.Rotation(math.pi/2,4,'X'))
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,.009),plane_no=(0,0,1),clear_inner=True)
 boundary=[e for e in bm.edges if e.is_boundary]
 for drop,growth in [(.025,1.0),(.15,1.22)]:
  ext=bmesh.ops.extrude_edge_only(bm,edges=boundary)
  added=[v for v in ext['geom'] if isinstance(v,bmesh.types.BMVert)]
  for v in added:v.co.z-=drop;v.co.x*=growth
  boundary=[e for e in bm.edges if e.is_boundary and all(v in added for v in e.verts)]
 bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 for f in data.polygons:f.use_smooth=True
 mat=bpy.data.materials.new(label+' natural skin');mat.use_nodes=True
 bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Roughness'].default_value=.64
 mesh.data.materials.append(mat)
 bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
 sub=mesh.modifiers.new('Smooth anatomical contours','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
 dec=mesh.modifiers.new('Mobile geometry budget','DECIMATE');dec.ratio=.4;bpy.ops.object.modifier_apply(modifier=dec.name)
 # A softly tinted short thumbnail follows the actual distal phalanx.
 color=mesh.data.color_attributes.new(name='Skin',type='FLOAT_COLOR',domain='POINT')
 nail_origin=transform('thumb_03_r')@heads['thumb_03_r']
 thumb_base=transform('thumb_02_r')@heads['thumb_02_r'];nail_origin=thumb_base+(nail_origin-thumb_base)*.86
 nail_up=(transform('thumb_03_r').to_3x3()@(heads['thumb_03_r']-heads['thumb_02_r']).normalized()).normalized()
 nail_side=nail_up.cross(Vector((0,0,1))).normalized()
 nail_normal=nail_side.cross(nail_up).normalized()
 for v in mesh.data.vertices:
  co=Matrix.Rotation(-math.pi/2,4,'X')@v.co
  if label=='right':co.x=-co.x
  d=co-nail_origin;u=d.dot(nail_up);w=d.dot(nail_side);depth=d.dot(nail_normal)
  skin=(.49,.265,.145)
  # Quiet palm creases distinguish the palm from the back of a mitten.
  if -.029<co.x<.022 and .023<co.y<.073 and co.z>.003:
   crease=min(abs(co.y-(.063-.15*co.x)),abs(co.y-(.038+.18*co.x)))
   fade=min(1,(co.x+.029)/.006,(.022-co.x)/.006)
   shade=.10*max(0,fade)*math.exp(-(crease/.0011)**2)
   skin=tuple(c*(1-shade) for c in skin)
  ellipse=(w/.0105)**2+((u-.0138)/.009)**2
  if ellipse<1 and depth>.003:
   blend=min(1,(1-ellipse)*12);nail=(.65,.43,.32)
   skin=tuple(a+(b-a)*blend for a,b in zip(skin,nail))
  # The IP crease belongs below the nail; shading remains deliberately subtle.
  if -.004<u<.001 and abs(w)<.009 and depth>.004:
   shadow=.10*math.exp(-((u+.0015)/.0012)**2)
   skin=tuple(c*(1-shadow) for c in skin)
  color.data[v.index].color=(*skin,1)
 vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Skin';mat.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
 bpy.ops.export_scene.gltf(filepath=str(root/'web/assets/3d'/f'{label}-hand.glb'),export_format='GLB',use_selection=True,export_animations=False)
 print('EXPORTED',label,len(data.vertices))
