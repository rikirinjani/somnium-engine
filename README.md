# acceptance-evidence

Protected evidence store for the `verify-change` acceptance gate.
Layout: `records/<head-sha>/{traces,qms}/*.json` and `outputs/<head-sha>/*.log`.
The record contract is documented in `verify-change` on main. Evidence is bound to exact base/head revisions; nothing here is synthesized by candidate code.
