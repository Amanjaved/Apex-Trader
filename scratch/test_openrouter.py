from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="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",
)

try:
    completion = client.chat.completions.create(
        model="nvidia/nemotron-3-super-120b-a12b:free",
        messages=[
            {"role": "user", "content": "Hello. Output only the word SUCCESS."}
        ],
        timeout=25
    )
    print("Response:", completion.choices[0].message.content)
except Exception as e:
    print("Error:", e)
