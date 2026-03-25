from PIL import Image

try:
    img = Image.open('设计稿/切换传统用户报事.png')
    pixels = img.load()
    width, height = img.size
    
    # Check pixels along the horizontal middle of the form section (e.g. y=300)
    for x in range(0, 30):
        print(f"y=300, x={x}: {pixels[x, 300]}")
    for x in range(0, 30):
        print(f"y=350, x={x}: {pixels[x, 350]}")
except Exception as e:
    print(e)
