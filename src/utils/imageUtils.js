/**
 * Compress image and convert non-JPEG/PNG images (e.g. .webp, .heic) to JPEG using Canvas.
 * FMS sync endpoint only accepts common formats like .jpg/.png.
 * Target size is around 500KB.
 */
export function compressImage(file, maxSizeKB = 500) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            let { naturalWidth: width, naturalHeight: height } = img;
            
            // Max dimension constraint to help hit the ~500kb target
            const MAX_SIZE = 1280;
            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = Math.round((height * MAX_SIZE) / width);
                    width = MAX_SIZE;
                } else {
                    width = Math.round((width * MAX_SIZE) / height);
                    height = MAX_SIZE;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Fill with white background in case of transparent png
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // Export to JPEG with 0.7 quality (typically yields < 300KB for 1280px)
            const targetQuality = 0.7;
            
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                const baseName = file.name.replace(/\.[^.]+$/, '');
                
                // If by some chance the generated blob is larger than original AND original is already JPEG, keep original.
                // Otherwise, use the compressed blob.
                const finalBlob = (blob.size > file.size && file.type === 'image/jpeg') ? file : blob;
                
                const jpegFile = new File([finalBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
                resolve(jpegFile);
            }, 'image/jpeg', targetQuality);
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file); // Fallback to original if conversion fails
        };
        
        img.src = url;
    });
}
