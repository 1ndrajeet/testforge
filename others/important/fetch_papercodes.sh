#!/bin/bash

# Initialize empty file if it doesn't exist
[ ! -f papercode_mapping.json ] && echo "{}" > papercode_mapping.json

# Get total count
total=$(jq 'length' exam_centers_array.json)
echo "Total centers: $total" >&2

# Get already processed IDs
processed=$(jq -r 'keys[]' papercode_mapping.json 2>/dev/null | paste -sd ' ')

# Filter out already processed IDs and process in parallel
jq -r '.[]' exam_centers_array.json | while read id; do
  # Skip if already processed
  if echo "$processed" | grep -qw "$id"; then
    continue
  fi
  echo "$id"
done | xargs -P 20 -I {} sh -c '
  codes=$(curl -s -m 5 "https://api.msbte.co.in/timetable_live_api/examcenterwise/papercodes/{}" | jq -c "map(.paper_code)" 2>/dev/null)
  if [ "$codes" != "null" ] && [ "$codes" != "[]" ] && [ "$codes" != "" ]; then
    echo "{}|$codes"
  fi
' | while IFS='|' read id codes; do
  # Atomically append to JSON
  jq --arg id "$id" --argjson codes "$codes" '. + {($id): $codes}' papercode_mapping.json > papercode_mapping.tmp
  mv papercode_mapping.tmp papercode_mapping.json
  echo "✅ $id done" >&2
done

echo "🎉 All done! Total centers: $(jq 'length' papercode_mapping.json)" >&2