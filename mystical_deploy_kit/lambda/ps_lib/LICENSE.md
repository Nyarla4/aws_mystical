# Third-Party License Notice

This directory (`ps_lib/`) contains PostScript source code that is **not
original to this project**. It is copied, unmodified except where noted in
`NOTICE.md`, from the following upstream projects:

- **mystical.ps, dmmsigils.ps, sigils.ps, sigil_dump.ps, sigil_page.py,
  sigil_table.py, sigil_test.ps, startest.ps, types.txt, samplesigils.txt**
  — from [denismm/mystical_ps](https://github.com/denismm/mystical_ps)
- **dmmlib/** (entire directory)
  — from [denismm/dmmlib](https://github.com/denismm/dmmlib)

## mystical_ps license

Mystical is dual-licensed (MIT or CC BY-SA 4.0, licensee's choice). This
project adopts the MIT option for the files listed above, reproduced below
in full as required by the license.

---

Copyright (c) 2025 Denis M. Moskowitz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Full original license text (with the CC BY-SA 4.0 alternative and additional
notes from the author) is available at:
https://github.com/denismm/mystical_ps/blob/main/LICENSE.md

## dmmlib license status

`dmmlib` does **not** currently carry an explicit open-source license in its
upstream repository (https://github.com/denismm/dmmlib). Its README states
the files are shared "in case they're useful to others," but this is not a
formal grant of redistribution rights. Bundling `dmmlib/` wholesale in this
project's public repository has not been separately cleared with the author.

**Action item:** contact Denis Moskowitz (repo owner) to confirm terms for
redistributing `dmmlib`, or replace the bundled copy with only the specific
functions actually used, re-implemented independently, until permission is
confirmed.
