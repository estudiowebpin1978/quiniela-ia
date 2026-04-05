c = open("app/predictions/page.tsx", encoding="utf-8").read()
search = 'tab==="rdbl"&&'
idx = c.find(search)
print("Found at:", idx)
if idx > 0:
    print(repr(c[idx:idx+600]))
