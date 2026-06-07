# Raw Image Viewer

[![Visual Studio Code](https://img.shields.io/badge/Visual%20Studio%20Code-0098ff.svg?style=for-the-badge&logo=visual-studio-code&logoColor=f3f3f3)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/typescript-%233178c6.svg?style=for-the-badge&logo=typescript&logoColor=faf9f8)](https://www.typescriptlang.org/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<div align="center">
  <img width="600" alt="raw-image-viewer-screenshot" src="https://github.com/user-attachments/assets/23ae0dd4-294c-496e-9f5f-341a86e93386" />
</div>

作者：[@temeedeeki](https://github.com/temeedeeki)

Visual Studio CodeのバイナリRAW画像ビューアー拡張機能です。

## 機能

- RAW画像ファイル（`*.raw`）の自動表示（3D画像にも対応）
- ファイル名・ディレクトリ名からの画像情報（データ型・幅・高さ・深さ）の取得
- 連番ファイルの自動認識と3D画像表示
- 画像の拡大・縮小
- 画像の最小値・最大値の調整
- 簡易的な統計情報の表示
  - Area（幅×高さ×深さ）
  - Mean（平均値）
  - Min（最小値）
  - Max（最大値）
  - Sum（合計）
- PNG形式での画像保存

## 注意点

- 本拡張機能は、既存のRAW画像ビューアー（AMIDE・ImageJ等）の代替を目指すものではなく、あくまでもVS Code内で簡単にRAW画像を確認できるようにするためのものです
- 研究発表や論文投稿などの正式な場で使用する際は、既存のRAW画像ビュアーを使用するようにしてください

## インストール

1. Releasesページから最新のVSIXファイルをダウンロードしてください。
2. VS Codeを開き、VS Codeの拡張機能管理画面（`Ctrl` + `Shift` + `X`）右上の「...」をクリックし「VSIX からのインストール...」を選択するか、拡張機能管理画面にVSIXファイルをドラッグ＆ドロップしてください。

    または、以下のコマンドでもインストールすることができます（VSIXファイルのパスは適宜変更してください）。

    ```bash
    code --install-extension raw-image-viewer-x.x.x.vsix
    ```

## 使い方

RAW画像ファイル（`*.raw`）をVS Codeで開くと、拡張機能が自動的に画像を表示します。

自動的な画像表示には、ファイル名または親ディレクトリ名に含まれるデータ型や画像の幅・高さ・深さなどの情報を使用します。

例1：`icon_float32_128x128.raw`

- データ型：32-bit float
- 幅：128
- 高さ：128
- 深さ：1

例2：`icons_uint8_64x64x8.raw`

- データ型：8-bit unsigned integer
- 幅：64
- 高さ：64
- 深さ：8

また、ディレクトリ内に連番ファイル（`000.raw`, `001.raw`, ...）が含まれる場合は、自動的に3D画像として表示されます。

例3：`icons_uint8_64x64/000.raw`, ..., `icons_uint8_64x64/007.raw`

- データ型：8-bit unsigned integer
- 幅：64
- 高さ：64
- 深さ：8（連番ファイル数）

なお、名前からの情報が不足している場合、画像は自動的に表示されないため、手動での入力が必要になります。

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。
