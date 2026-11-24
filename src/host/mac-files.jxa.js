ObjC.import('AppKit');
ObjC.import('Foundation');

const manager = $.NSFileManager.defaultManager;
const pasteboard = $.NSPasteboard.generalPasteboard;
const exclusiveRename = 0x00000004; // Darwin RENAME_EXCL
const transferType = 'com.dsh.workspace-explorer.transfer';

function clipboard(expectedToken) {
  const options = $.NSDictionary.dictionaryWithObjectForKey($.NSNumber.numberWithBool(true), $.NSPasteboardURLReadingFileURLsOnlyKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    const sequence = Number(pasteboard.changeCount);
    const token = ObjC.unwrap(pasteboard.stringForType(transferType));
    const paths = [];
    if (!expectedToken || token !== expectedToken) {
      const urls = pasteboard.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL), options);
      if (urls && !urls.isNil()) {
        for (let index = 0; index < Number(urls.count); index++) {
          const url = urls.objectAtIndex(index).filePathURL;
          const path = url && !url.isNil() ? url.fileSystemRepresentation : null;
          paths.push(path || null);
        }
      }
    }
    if (sequence === Number(pasteboard.changeCount)) return { paths, sequence, token };
  }
  throw new Error('Clipboard changed');
}

function moveOrCopy(source, destination, cut) {
  const error = $();
  const success = cut
    ? manager.moveItemAtPathToPathError(source, destination, error)
    : manager.copyItemAtPathToPathError(source, destination, error);
  if (success) return 'ok';
  if (error.isNil()) return 'failed';
  const domain = ObjC.unwrap(error.domain);
  const code = Number(error.code);
  if ((domain === 'NSCocoaErrorDomain' && (code === 4 || code === 260))
      || (domain === 'NSPOSIXErrorDomain' && code === 2)) return 'missing';
  if ((domain === 'NSCocoaErrorDomain' && code === 516) || (domain === 'NSPOSIXErrorDomain' && code === 17)) return 'exists';
  if ((domain === 'NSCocoaErrorDomain' && (code === 257 || code === 513))
      || (domain === 'NSPOSIXErrorDomain' && (code === 1 || code === 13))) return 'denied';
  return 'failed';
}

function transfer(source, destination, cut) {
  const basename = source.split('/').pop();
  const dot = basename.lastIndexOf('.');
  const stem = dot > 0 ? basename.slice(0, dot) : basename;
  const extension = dot > 0 ? basename.slice(dot) : '';
  const temporary = cut ? null : destination + '/.dsh-copy-' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
  if (temporary && !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
    temporary, false, $.NSDictionary.dictionary, null,
  )) return false;
  const staged = temporary ? temporary + '/' + basename : source;
  try {
    if (temporary && moveOrCopy(source, staged, false) !== 'ok') return false;
    for (let index = 1; index <= 1000; index++) {
      const name = index === 1 ? basename : stem + ' (' + index + ')' + extension;
      const result = moveOrCopy(staged, destination + '/' + name, true);
      if (result === 'ok') return true;
      if (result !== 'exists') return false;
    }
    return false;
  } finally {
    if (temporary) manager.removeItemAtPathError(temporary, null);
  }
}

function rename(source, destination) {
  if (!manager.fileExistsAtPath(source)) return 'missing';
  // Foundation can treat a case-only rename as a conflict on case-insensitive APFS.
  if (source !== destination && source.toLowerCase() === destination.toLowerCase()) {
    try {
      ObjC.bindFunction('renamex_np', ['int', ['char*', 'char*', 'unsigned int']]);
      if ($.renamex_np(source, destination, exclusiveRename) === 0) return 'ok';
    } catch { /* Foundation still checks destination conflicts. */ }
  }
  return moveOrCopy(source, destination, true);
}

function run() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const request = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
  let result;
  switch (request.action) {
    case 'stage': {
      const items = $.NSMutableArray.array;
      for (const [index, source] of request.sources.entries()) {
        const item = $.NSPasteboardItem.alloc.init;
        const url = $.NSURL.fileURLWithPath(source);
        if (!item.setStringForType(url.absoluteString, $.NSPasteboardTypeFileURL)
            || (index === 0 && !item.setStringForType(request.token, transferType))) {
          throw new Error('Could not prepare clipboard item');
        }
        items.addObject(item);
      }
      pasteboard.clearContents;
      if (!pasteboard.writeObjects(items)) throw new Error('Could not write file URLs');
      const sequence = Number(pasteboard.changeCount);
      if (ObjC.unwrap(pasteboard.stringForType(transferType)) !== request.token
          || sequence !== Number(pasteboard.changeCount)) throw new Error('Clipboard changed');
      result = { ok: true, sequence };
      break;
    }
    case 'clipboard':
      result = clipboard(request.token);
      break;
    case 'rename':
      result = { result: rename(request.source, request.destination) };
      break;
    case 'transfer':
      result = { results: request.sources.map(source => transfer(source, request.destination, request.cut)) };
      break;
    case 'recycle':
      result = { results: request.sources.map(source => Boolean(manager.trashItemAtURLResultingItemURLError(
        $.NSURL.fileURLWithPath(source), null, null,
      ))) };
      break;
    default:
      throw new Error('Unknown file operation');
  }
  return JSON.stringify(result);
}
