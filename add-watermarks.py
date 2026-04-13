#!/usr/bin/env python3
"""Add ghost watermarks and light leaks to all dashboard pages."""
import re

pages = {
    "client/src/pages/Architect.tsx": ("ARCHITECT", 270),
    "client/src/pages/Social.tsx": ("SOCIAL", 137),
    "client/src/pages/Analytics.tsx": ("ANALYTICS", 167),
    "client/src/pages/PlatformHealth.tsx": ("HEALTH", 112),
    "client/src/pages/PluginStore.tsx": ("PLUGINS", 44),
    "client/src/pages/Merchant.tsx": ("MERCHANT", None),
    "client/src/pages/Activity.tsx": ("ACTIVITY", None),
    "client/src/pages/Intelligence.tsx": ("INTELLIGENCE", None),
    "client/src/pages/Config.tsx": ("CONFIG", None),
    "client/src/pages/Integrations.tsx": ("INTEGRATIONS", None),
    "client/src/pages/Profile.tsx": ("PROFILE", None),
    "client/src/pages/SupplierPOs.tsx": ("SUPPLY", None),
}

watermark_block = """      {{/* Ghost watermark */}}
      <div className="ghost-watermark" aria-hidden="true">{wm}</div>
      {{/* Light leaks */}}
      <div className="light-leak-blue" style={{{{top: '5%', left: '10%'}}}} aria-hidden="true" />
      <div className="light-leak-purple" style={{{{top: '50%', right: '5%'}}}} aria-hidden="true" />"""

for filepath, (watermark, hint_line) in pages.items():
    try:
        with open(filepath, 'r') as f:
            lines = f.readlines()
        
        # Find the last "return (" that is the main export
        # Strategy: find "export default function" then find the return ( after it
        export_line = -1
        for i, line in enumerate(lines):
            if line.startswith("export default function"):
                export_line = i
        
        if export_line == -1:
            print(f"⚠ No export default found in {filepath}")
            continue
        
        # Find the return ( after the export_line
        return_line = -1
        for i in range(export_line, len(lines)):
            if lines[i].strip() == "return (":
                return_line = i
                break
        
        if return_line == -1:
            print(f"⚠ No return ( found after export in {filepath}")
            continue
        
        # The line after return ( should be the opening div
        next_line = lines[return_line + 1] if return_line + 1 < len(lines) else ""
        
        # Check if it already has ghost-watermark
        if "ghost-watermark" in ''.join(lines[return_line:return_line+10]):
            print(f"✓ Already has watermark: {filepath}")
            continue
        
        # Find the opening div and wrap it
        opening_div_line = return_line + 1
        opening_div = lines[opening_div_line].rstrip()
        
        # Check if it's a div with space-y
        if '<div className="space-y-' in opening_div:
            # Replace the opening div with relative wrapper + watermarks + inner div
            indent = len(opening_div) - len(opening_div.lstrip())
            ind = " " * indent
            
            wm_block = watermark_block.format(wm=watermark)
            
            new_line = f'{ind}<div className="relative">\n{wm_block}\n{opening_div}\n'
            lines[opening_div_line] = new_line
            
            # Now find the matching closing </div> for the outer div
            # Count from opening_div_line to find the last </div> before );
            # Simple: find the last "  );" and the line before it
            for i in range(len(lines) - 1, opening_div_line, -1):
                if lines[i].strip() == ");":
                    # The line before should be </div>
                    close_line = i - 1
                    while close_line > opening_div_line and lines[close_line].strip() == "":
                        close_line -= 1
                    if "</div>" in lines[close_line]:
                        lines[close_line] = lines[close_line].rstrip() + "\n    </div>\n"
                    break
            
            with open(filepath, 'w') as f:
                f.writelines(lines)
            print(f"✓ Added watermark to {filepath}")
        else:
            print(f"⚠ Opening div pattern not matched in {filepath}: {opening_div[:80]}")
    except Exception as e:
        print(f"✗ Error in {filepath}: {e}")

print("\nDone!")
