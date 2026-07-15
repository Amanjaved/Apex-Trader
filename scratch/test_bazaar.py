from openai import OpenAI

client = OpenAI(
    base_url="https://bazaarlink.ai/api/v1",
    api_key="sk-bl-e0bEWh3UCw59I0OmbdjiCYzvSW0DJHLaabEYMLzu6yHOBNPI",
)

try:
    completion = client.chat.completions.create(
        model="openai/gpt-4.1",
        messages=[
            {"role": "user", "content": "Hello. Output only the word SUCCESS."}
        ],
    )
    print("Response:", completion.choices[0].message.content)
except Exception as e:
    print("Error:", e)
