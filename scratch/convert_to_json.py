import json

with open('scratch/symptoms_list.txt', 'r', encoding='utf-16') as f:
    symptoms = [line.strip() for line in f if line.strip()]

# Remove scikit-learn warnings if any (should be caught by redirect but just in case)
symptoms = [s for s in symptoms if not s.startswith("C:\\") and not s.startswith("warnings")]

with open('src/data/symptoms.json', 'w') as f:
    json.dump(symptoms, f, indent=4)

print(f"Exported {len(symptoms)} symptoms to src/data/symptoms.json")
