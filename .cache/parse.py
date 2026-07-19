import json
import sys
from collections import defaultdict

with open('.cache/wikidata.json') as f:
    data = json.load(f)

rows = data['results']['bindings']
print(f"Total rows: {len(rows)}")

# Group by item (QID) so we get unique distros
by_item = defaultdict(list)
for r in rows:
    qid = r['item']['value'].split('/')[-1]
    by_item[qid].append(r)

print(f"Unique items: {len(by_item)}")
print()

# Print summaries
distros = []
for qid, group in sorted(by_item.items(), key=lambda x: x[1][0]['itemLabel']['value']):
    label = group[0].get('itemLabel', {}).get('value', '?')
    desc = group[0].get('itemDescription', {}).get('value', '')
    website = group[0].get('website', {}).get('value', '')
    logo = group[0].get('logo', {}).get('value', '')
    developer = group[0].get('developer', {}).get('value', '')
    inception = group[0].get('inception', {}).get('value', '')

    # Look for designer field too
    designer = group[0].get('designer', {}).get('value', '')

    distros.append({
        'qid': qid,
        'label': label,
        'desc': desc,
        'website': website,
        'logo': logo,
        'developer': developer,
        'inception': inception,
        'designer': designer,
    })
    print(f"QID: {qid}")
    print(f"  Label:      {label}")
    print(f"  Description: {desc}")
    print(f"  Website:    {website}")
    print(f"  Logo:       {logo}")
    print(f"  Developer:  {developer}")
    print(f"  Inception:  {inception}")
    print()

# Save to a clean json
with open('.cache/distros.json', 'w') as f:
    json.dump(distros, f, indent=2)
print(f"Saved to .cache/distros.json")
