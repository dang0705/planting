#!/usr/bin/env python3
import os
import _tmp_qhz_build_closeup_patch as b
TARGET=['5','10','23','27','50','57','62','88','98','107','118','125','134','140','149','153','158','163','170','175','180','197']
sub=int(os.environ.get('SUB_INDEX','0')); count=int(os.environ.get('SUB_COUNT','4'))
b.SEL={pid:b.SEL[pid] for i,pid in enumerate(TARGET) if i%count==sub}
os.environ['PART_INDEX']='0';os.environ['PART_COUNT']='1'
b.main()
