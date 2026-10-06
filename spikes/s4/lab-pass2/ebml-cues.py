import sys
IDS={0x1C53BB6B:'Cues',0x114D9B74:'SeekHead',0x1F43B675:'Cluster',0x1549A966:'Info',0x1654AE6B:'Tracks',0x1254C367:'Tags',0xEC:'Void'}
def vint(b,i,is_id=False):
    first=b[i]; l=1; m=0x80
    while l<=8 and not first&m: m>>=1; l+=1
    v = first if is_id else first & (m-1)
    for k in range(1,l): v=(v<<8)|b[i+k]
    unknown = (not is_id) and v==(1<<(7*l))-1
    return v,l,unknown
def top(path):
    b=open(path,'rb').read()
    i=0; seen=[]
    _,l,_=vint(b,i,True); i+=l; s,l2,_=vint(b,i); i+=l2+s   # EBML header
    sid,l,_=vint(b,i,True); i+=l; ssz,l2,unk=vint(b,i); i+=l2
    assert sid==0x18538067
    end=len(b)
    unknown_cluster=False; counts={}
    while i<end:
        eid,l,_=vint(b,i,True); sz,l2,u=vint(b,i+l)
        n=IDS.get(eid,hex(eid)); counts[n]=counts.get(n,0)+1
        if u: unknown_cluster=True; break
        i+=l+l2+sz
    return {'segmentUnknownSize':unk,'topLevel':counts,'stoppedAtUnknownSizeElement':unknown_cluster,
            'cuesTopLevel':counts.get('Cues',0)>0,'rawCuesIdOccurrences':b.count(bytes.fromhex('1C53BB6B'))}
for p in sys.argv[1:]: print(p.split('/')[-1], top(p))
