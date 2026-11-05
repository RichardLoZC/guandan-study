"""Copy the delivered ExpertStyle tensors into the unchanged official ONNX graph.

Requires torch, numpy and onnx. Input checkpoints are supplied by the maintainer;
this script never loads player data or trains a model.
"""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
import onnx
from onnx import numpy_helper
import torch

BASELINE_SHA='5341d7316bac1ead4098c796ea03f7e38fb47f001cc647a52be3ed0d15cd7244'
CANDIDATE_SHA='4738435b59911b10327225d7ef48a5ec5ed9e4f8088215ad168375f6b59e11eb'
CHANGED={'q_head.4.weight','q_head.4.bias','q_head.6.weight','q_head.6.bias'}
def digest(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--candidate',required=True);p.add_argument('--graph',required=True);p.add_argument('--output',required=True);p.add_argument('--evidence',required=True);a=p.parse_args()
    assert digest(a.baseline)==BASELINE_SHA and digest(a.candidate)==CANDIDATE_SHA,'Checkpoint identity mismatch'
    old=torch.load(a.baseline,map_location='cpu',weights_only=True);new=torch.load(a.candidate,map_location='cpu',weights_only=True)
    old=old.get('model_state_dict') or old['model'];new=new.get('model_state_dict') or new['model'];assert set(old)==set(new)
    changed={k for k in old if not torch.equal(old[k],new[k])};assert changed==CHANGED,changed
    graph=onnx.load(a.graph);replaced=[]
    for tensor in graph.graph.initializer:
        assert tensor.name in old,tensor.name
        assert np.array_equal(numpy_helper.to_array(tensor),old[tensor.name].numpy()),tensor.name
        if tensor.name in CHANGED:
            tensor.CopyFrom(numpy_helper.from_array(new[tensor.name].numpy(),name=tensor.name));replaced.append(tensor.name)
    assert set(replaced)==CHANGED
    onnx.checker.check_model(graph,full_check=True)
    output=Path(a.output);assert not output.exists(),'Refusing to overwrite an exported model'
    output.parent.mkdir(parents=True,exist_ok=True);onnx.save(graph,output)
    loaded=onnx.load(output);original=onnx.load(a.graph)
    assert loaded.graph.node==original.graph.node and loaded.graph.input==original.graph.input and loaded.graph.output==original.graph.output
    for t in loaded.graph.initializer:assert np.array_equal(numpy_helper.to_array(t),new[t.name].numpy())
    record={'method':'replace-delivered-weights-in-unchanged-ONNX-graph','baselineCheckpointSha256':BASELINE_SHA,'candidateCheckpointSha256':CANDIDATE_SHA,'graphSourceSha256':digest(a.graph),'exportSha256':digest(output),'replacedTensors':sorted(replaced),'changedParameters':sum(int(torch.count_nonzero(old[k]!=new[k])) for k in changed),'unchangedCheckpointTensors':len(old)-len(changed),'contextEncoderUnchanged':True,'phaseContract':{'play':'expert-style-v1','give':'danlm-v1','return':'danlm-v1'},'trainingPerformed':False}
    Path(a.evidence).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
if __name__=='__main__':main()
