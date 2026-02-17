export function getExtension(extension: string): string {
  const ext = extension.split('.').pop() as string;

  switch(ext) {
    case 'svg':
      return 'SVG';
    case 'jpg':
      return 'JPG';
    case 'csv':
      return 'CSV';
    case 'jpeg':
      return 'JPG';
    case 'png':
      return 'PNG';
    case 'gz':
      return 'TAR';
    case 'zip':
      return 'ZIP';
    case 'doc':
    case 'docx':
      return 'Document';
    case 'xls':
    case 'xlsx':
      return 'Excel';
    case 'ppt':
    case 'pptx':
      return 'Powerpoint';
    case 'backup':
      return 'Backup';
    default:
      return ext;
  }
}

export default getExtension;
