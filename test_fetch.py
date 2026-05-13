import urllib.request
import re

url = "https://www.threads.net/@zuck/post/CuW6-7KyIX_"
req = urllib.request.Request(url, headers={'User-Agent': 'facebookexternalhit/1.1'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        matches = re.findall(r'<meta property="og:image" content="([^"]+)"', html)
        if matches:
            print(f"Found og:image: {matches[0]}")
        else:
            print("og:image not found in HTML.")
            print("First 500 chars:", html[:500])
except Exception as e:
    print(f"Error: {e}")
