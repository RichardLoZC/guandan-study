# DanLM v1 alignment — 2026-11-03

Pinned upstream commit: `d200e455f63fd46aa398e97b69a6bb94cf1ba098`. Weights are unchanged.

The adapter repairs joker rank markers, wildcard full-house history ordering, complete physical-face/declared-action candidates, tribute model inputs and double-finish terminal ordering. It preserves game-specific series rules. Official v1/v2 enumeration APIs have different candidate ordering; the v1 order is used, while exact action sets and chosen vectors were checked against the original frozen oracle.

The same 1,144 fixed play nodes passed exact history/hand/candidate-set/choice checks. Each CPU and WASM backend passed 102,116 Q values; 146,432 context values also passed. Every finite value must satisfy `abs(actual-reference) <= 1e-5+1e-4*abs(reference)`. The original52 return decisions improved from14 identical choices to52;260 added tribute cases also passed. Original156 phase histories and7 boundaries were retained.416 replay groups included104 complete rounds; terminal ranks matched.101,250 raw non-pass action keys were accepted by the rules core.

The main832 nodes improved from741 exact choices to832. No different sources were substituted to obtain this result. Numerical compatibility on a finite corpus does not prove universal equivalence, calibrated values or a strength gain.

The public client shares the verified adapter, raw model worker, rules and model weights. Its UI and transports include only offline and LAN operation. Post-round feedback remains local and is not automatically a reward or training label.
