# Sweeps for flips: dog-ear fold size and page angle in small steps.
import json
exec(open("gen-bench.py").read().split("PW, PH = 380, 537\nbase")[0])
PW, PH = 340, 480
base = paper(PW, PH, "INVOICE S")
for a in range(30, 125, 5):
    obj = dogear(base, a, int(a * 0.85))
    for ang in [-6, -2, 3, 7, 15]:
        add(f"sweep-{a:03d}-a{ang}", obj, ang, truth(PW, PH, 0, PW, PH, ang))
for k in [0.02, 0.05, 0.08, 0.11, 0.14, 0.17, 0.2]:
    obj = warp(shade_thirds(base), *creased(k=k))
    for ang in [-6, 3, 15]:
        add(f"thirdsw-{k}-a{ang}", obj, ang)
json.dump(cases, open("bench/cases2.json", "w"), indent=0)
print(len(cases))
