import { tsconfig } from './tsconfig.js'
import { relative, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPathsMatcher, type TsConfigResult } from 'get-tsconfig'
import {
  resolveImports,
  type PathConditionsMap,
} from 'resolve-pkg-maps'
import { walkUp } from 'walk-up-path'
import { catcher } from '@isaacs/catcher'
import { readFile } from '../ts-sys-cached.js'
import { classifyModule } from '../classify-module.js'

const resolveTypescriptMapping = (
  url: string,
  parent: string | undefined
): string | undefined => {
  if (!url || url.startsWith('file:///') || !parent) return undefined
  const options = tsconfig().options

  const relativePath = url
  const tsconfigArg = {
    config: { compilerOptions: { ...options, baseUrl: './' } },
    path: options.configFilePath as string,
  } as TsConfigResult

  const pathMather = createPathsMatcher(tsconfigArg)

  if (!pathMather) return undefined
  const found = pathMather(relativePath)
  if (found.length === 0) return undefined
  return relative(
    dirname(fileURLToPath(parent)),
    found[0] as string
  ).toString()
}

const getPackageJson = (
  from: string
):
  | ({ imports: PathConditionsMap } & { path: string })
  | undefined => {
  for (const d of walkUp(from)) {
    const pj = catcher(() => {
      const json = readFile(d + '/package.json')
      if (!json) return undefined
      const pj = JSON.parse(json) as { imports: PathConditionsMap }
      return pj
    })
    if (pj) {
      return { imports: pj?.imports, path: d }
    }
  }
  return undefined
}

const resolvePackageJsonMapping = (
  url: string,
  parent: string | undefined
): string | undefined => {
  if (
    !url ||
    url.startsWith('file:///') ||
    !url.startsWith('#') ||
    !parent
  )
    return undefined

  const options = getPackageJson(dirname(fileURLToPath(parent)))
  if (options === undefined) return undefined

  const found = resolveImports(options.imports, url, [
    'default',
    'node',
    classifyModule(url) === 'commonjs' ? 'require' : 'import',
  ])
  if (found.length === 0) return undefined
  return relative(
    dirname(fileURLToPath(parent)),
    join(options.path, found[0] as string)
  ).toString()
}

export const resolveMapping = (
  url: string,
  parent: string | undefined
): string => {
  return (
    resolvePackageJsonMapping(url, parent) ??
    resolveTypescriptMapping(url, parent) ??
    url
  )
}
