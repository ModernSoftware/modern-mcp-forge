/** Python's stdlib AST provides UTF-8 byte ranges without loading application code. */
export const pythonInsertion = String.raw`
import ast
import json
import sys

def insert(data):
    source = data["source"]
    tree = ast.parse(source)
    factories = [node for node in tree.body
                 if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and node.name == data["factory"]]
    def unsupported():
        raise ValueError("unsupported")
    if len(factories) != 1 or factories[0].decorator_list:
        unsupported()
    factory = factories[0]
    def returns(node):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            return []
        if isinstance(node, ast.Return):
            return [node]
        return [found for child in ast.iter_child_nodes(node) for found in returns(child)]
    found = [node for statement in factory.body for node in returns(statement)]
    if len(found) != 1 or factory.body[-1] is not found[0] or not isinstance(found[0].value, ast.Dict):
        unsupported()
    if any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in ast.walk(factory)):
        unsupported()
    returned = found[0]
    registry = returned.value
    def entries(dictionary):
        if not isinstance(dictionary, ast.Dict):
            unsupported()
        result = {}
        for key, value in zip(dictionary.keys, dictionary.values):
            if not isinstance(key, ast.Constant) or not isinstance(key.value, str) or key.value in result:
                unsupported()
            result[key.value] = value
        return result
    group = entries(registry).get(data["kind"])
    if group is not None and data["name"] in entries(group):
        raise ValueError('Handler "' + data["name"] + '" already exists under ' + data["kind"] + '. Choose “Use an existing handler” to bind it.')
    target = group if group is not None else registry
    raw = source.encode("utf-8")
    lines = raw.splitlines(keepends=True)
    def offset(node):
        return sum(len(line) for line in lines[:node.lineno - 1]) + node.col_offset
    def indent(node):
        line = lines[node.lineno - 1]
        return line[:len(line) - len(line.lstrip(b" \t"))].decode()
    return_start = sum(len(line) for line in lines[:returned.lineno - 1])
    prefix = raw[return_start:offset(returned)].decode()
    if not prefix or prefix.strip():
        unsupported()
    unit = prefix[len(indent(factory)):]
    if not unit:
        unsupported()
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    names.update(node.arg for node in ast.walk(tree) if isinstance(node, ast.arg))
    names.update(node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)))
    names.update(node.asname or node.name.split('.')[0] for node in ast.walk(tree) if isinstance(node, ast.alias))
    names.update(name for node in ast.walk(tree) if isinstance(node, (ast.Global, ast.Nonlocal)) for name in node.names)
    base = "handle_" + data["name"].replace("-", "_")
    function = base
    suffix = 2
    while function in names:
        function = base + "_" + str(suffix)
        suffix += 1
    snippet = data["snippet"].replace("def " + base + "(", "def " + function + "(", 1)
    eol = "\r\n" if "\r\n" in source else "\n"
    definition = eol.join(prefix + (unit + line[4:] if line.startswith("    ") else line) for line in snippet.split("\n")) + eol + eol
    target_indent = indent(target)
    child_indent = indent(target.keys[0]) if target.keys else ""
    if len(child_indent) <= len(target_indent):
        child_indent = target_indent + unit
    binding = json.dumps(data["name"]) + ": " + function
    if group is None:
        binding = json.dumps(data["kind"]) + ": {" + binding + "}"
    addition = eol + child_indent + binding + ("," if target.keys else eol + target_indent)
    if target.keys and b"\n" not in raw[offset(target) + 1:offset(target.keys[0])]:
        addition += eol + child_indent
    edits = [(offset(target) + 1, addition.encode("utf-8")), (return_start, definition.encode("utf-8"))]
    for position, content in sorted(edits, reverse=True):
        raw = raw[:position] + content + raw[position:]
    content = raw.decode("utf-8")
    ast.parse(content)
    return content

try:
    print(json.dumps({"content": insert(json.loads(sys.stdin.buffer.read().decode("utf-8")))}))
except (SyntaxError, ValueError) as error:
    print(json.dumps({"error": str(error) if isinstance(error, ValueError) else "Fix the Python worker syntax before adding a handler."}))
`;
