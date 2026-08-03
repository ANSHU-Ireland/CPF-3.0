# Assumption ledger (plan §10)

| ID | Assumption | Class | Risk if wrong | Validation/owner |
|---|---|---|---|---|
| A1 | Existing Super Admin and Employer Admin remain in scope and stable | A1 | Broader rewrite and migration | Product/engineering at S01 |
| A2 | Initial market is Ireland/EU, adult candidates | A3 | National/legal/control changes | Counsel at S03 |
| A3 | CPF and employer legal/data roles are not final | A3 | Contracts, notices, architecture change | DPO/counsel at S03 |
| A4 | Standard proctor mode uses human-reviewed camera without biometric/emotion inference | A3 | DPIA and product redesign | DPO/product at S03/S15 |
| A5 | Equivalent supervised/accessible route is operationally feasible | A3 | Exclusion and equality risk | Product/employer at S03/S12 |
| A6 | Four initial packs cover two SWE and two marketing roles | A2 | Job relevance/market gap | Job analysis at S07 |
| A7 | Existing modular monolith scales through pilot | A1 | Service isolation later | Load evidence at S18 |
| A8 | Tauri/WebView meets supported-device and accessibility needs | A2 | Desktop technology change | Prototype at S12/S15 |
| A9 | No universal score or autonomous decision remains core policy | A2 | Major product/classification shift | Founder/governance before S05 |

Class A1 = engineering assumption, A2 = product assumption, A3 = requires professional
(legal/DPO/I-O) determination before live use. No A3 assumption may be silently
converted into code behaviour.
