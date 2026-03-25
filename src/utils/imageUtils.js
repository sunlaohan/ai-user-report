/**
 * Convert non-JPEG/PNG images (e.g. .webp, .heic) to JPEG using Canvas.
 * FMS sync endpoint only accepts common formats like .jpg/.png.
 */
export function convertToJpeg(file) {
    return new Promise((resolve) => {
        // If already JPEG or PNG, no conversion needed
        if (file.type === 'image/jpeg' || file.type === 'image/png') {
            resolve(file);
            return;
        }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                const baseName = file.name.replace(/\.[^.]+$/, '');
                const jpegFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
                resolve(jpegFile);
            }, 'image/jpeg', 0.92);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file); // Fallback to original if conversion fails
        };
        img.src = url;
    });
}
