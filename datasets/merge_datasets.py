import json

with open("final_training_dataset.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("TOTAL SAMPLES:", len(data))

print("\nFIRST SAMPLE:\n")

print(json.dumps(data[0], indent=2, ensure_ascii=False))