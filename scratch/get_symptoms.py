import pandas as pd
try:
    from datasets import load_dataset
    dataset = load_dataset("kamruzzaman-asif/Diseases_Dataset", split="dhivyeshrk")
    df = pd.DataFrame(dataset)
    df['Symptoms_list'] = df['Symptoms'].apply(
        lambda x: [s.strip().lower() for s in str(x).split(',')]
    )
    unique_symptoms = sorted(df['Symptoms_list'].explode().unique())
    print("\n".join(unique_symptoms))
except Exception as e:
    print(f"Error: {e}")
