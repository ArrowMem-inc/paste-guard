"""Write a deterministic zip of a directory tree, for the store archive.

WHY THIS EXISTS RATHER THAN THE zip BINARY. scripts/zip.mjs shelled out to
`zip -r -X`, which is not present on the machine this is packaged from, so no
archive could be produced at all and release/ held a checksum file for a zip
that did not exist. The alternatives were each worse: installing a tool onto
the build machine to ship a security extension, adding an npm dependency to a
product whose whole argument is that it has none, or the system tar, which does
write a real zip but prefixes every entry with "./" and a store review is not
the place to find out whether that matters.

DETERMINISTIC ON PURPOSE. Entries are sorted, timestamps are fixed and the
compression is stated, so the same tree always produces the same bytes and the
published SHA-256 is reproducible by anyone who checks out the same commit.
`zip -r -X` was already trying for this; it stored real mtimes, so it was not
actually reproducible. This is stricter than what it replaced, not looser.
"""
import os
import sys
import zipfile

FIXED_DATE = (1980, 1, 1, 0, 0, 0)


def build(src, out):
    names = []
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for f in sorted(files):
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src).replace(os.sep, "/")
            names.append((rel, full))
    names.sort()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, full in names:
            info = zipfile.ZipInfo(rel, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(full, "rb") as fh:
                z.writestr(info, fh.read())
    return [n for n, _ in names]


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    entries = build(src, out)
    print("zipped %d entries" % len(entries))
    if "manifest.json" not in entries:
        print("FAIL: no manifest.json at the archive root", file=sys.stderr)
        sys.exit(1)
