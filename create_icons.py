from cairosvg import svg2png
import os

def create_icon(size):
    svg2png(url='icons/icon.svg',
            write_to=f'icons/icon{size}.png',
            output_width=size,
            output_height=size)

# Create icons of different sizes
sizes = [16, 48, 128]
for size in sizes:
    create_icon(size) 